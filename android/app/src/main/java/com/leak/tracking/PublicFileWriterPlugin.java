package com.leak.tracking;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.system.Os;
import android.util.Base64;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

@CapacitorPlugin(name = "PublicFileWriter")
public class PublicFileWriterPlugin extends Plugin {
    private static final long MAX_EXPORT_BYTES = 1024L * 1024L * 1024L;
    private static final int MAX_CHUNK_BYTES = 1024 * 1024;
    private final ConcurrentHashMap<String, File> preparedExports = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Boolean> committingExports = new ConcurrentHashMap<>();
    private final ExecutorService exportExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void prepare(PluginCall call) {
        try {
            String token = UUID.randomUUID().toString();
            File pending = File.createTempFile("public-export-", ".pending", getContext().getCacheDir());
            preparedExports.put(token, pending);
            JSObject result = new JSObject();
            result.put("token", token);
            result.put("maxExportBytes", MAX_EXPORT_BYTES);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void appendChunk(PluginCall call) {
        String token = call.getString("token", "");
        String chunkBase64 = call.getString("chunkBase64");
        File pending = preparedExports.get(token);
        if (pending == null || committingExports.containsKey(token) || chunkBase64 == null) {
            call.reject("Unknown export token or missing chunk");
            return;
        }
        if (chunkBase64.length() > ((MAX_CHUNK_BYTES + 2L) / 3L) * 4L + 4L) {
            discardPreparedExport(token);
            call.reject("Export chunk is too large");
            return;
        }

        try {
            byte[] chunk = Base64.decode(chunkBase64, Base64.DEFAULT);
            if (chunk.length > MAX_CHUNK_BYTES || pending.length() + chunk.length > MAX_EXPORT_BYTES) {
                throw new Exception("Export exceeds the safety limit");
            }
            try (FileOutputStream stream = new FileOutputStream(pending, true)) {
                stream.write(chunk);
            }
            JSObject result = new JSObject();
            result.put("size", pending.length());
            call.resolve(result);
        } catch (Exception error) {
            discardPreparedExport(token);
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void discard(PluginCall call) {
        discardPreparedExport(call.getString("token", ""));
        call.resolve();
    }

    @PluginMethod
    public void commit(PluginCall call) {
        String token = call.getString("token", "");
        Long expectedSize = call.getLong("expectedSize");
        String folder = call.getString("folder", "");
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        File pending = preparedExports.get(token);
        if (
            pending == null ||
            expectedSize == null ||
            expectedSize < 0 ||
            expectedSize > MAX_EXPORT_BYTES ||
            pending.length() != expectedSize ||
            fileName == null ||
            fileName.trim().isEmpty()
        ) {
            if (pending != null) {
                preparedExports.remove(token, pending);
                pending.delete();
            }
            call.reject("Unknown export token or missing fileName");
            return;
        }

        if (committingExports.putIfAbsent(token, Boolean.TRUE) != null) {
            call.reject("Export is already being committed");
            return;
        }

        try {
            exportExecutor.execute(() -> {
                try (InputStream source = new FileInputStream(pending)) {
                    String safeFolder = sanitizeRelativePath(folder);
                    String safeFileName = sanitizeFileName(fileName);
                    if (safeFileName.isEmpty()) throw new Exception("fileName contains no valid characters");
                    String savedPath = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? writeWithMediaStore(safeFolder, safeFileName, mimeType, source)
                        : writeLegacy(safeFolder, safeFileName, source);
                    JSObject result = new JSObject();
                    result.put("path", savedPath);
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject(error.getMessage(), error);
                } finally {
                    finishCommittedExport(token, pending);
                }
            });
        } catch (RejectedExecutionException error) {
            finishCommittedExport(token, pending);
            call.reject("Export service is shutting down", error);
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private String writeWithMediaStore(String folder, String fileName, String mimeType, InputStream source) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        Uri collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        String relativePath = Environment.DIRECTORY_DOCUMENTS + (folder.isEmpty() ? "/" : "/" + folder + "/");

        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri item = resolver.insert(collection, values);
        if (item == null) {
            throw new Exception("Unable to create export file");
        }

        boolean published = false;
        try {
            try (OutputStream stream = resolver.openOutputStream(item, "w")) {
                if (stream == null) {
                    throw new Exception("Unable to open export file");
                }
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = source.read(buffer)) >= 0) {
                    stream.write(buffer, 0, read);
                }
                stream.flush();
            }

            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            if (resolver.update(item, done, null, null) != 1) {
                throw new Exception("Unable to publish export file");
            }
            published = true;

            // Keep the previous export intact until the replacement is fully
            // written and visible. A failed write must never destroy the last
            // usable copy.
            deleteExistingFile(resolver, collection, relativePath, fileName, item);

            return "Documents/" + (folder.isEmpty() ? "" : folder + "/") + fileName;
        } finally {
            if (!published) {
                try {
                    resolver.delete(item, null, null);
                } catch (Exception ignored) {}
            }
        }
    }

    private void deleteExistingFile(
        ContentResolver resolver,
        Uri collection,
        String relativePath,
        String fileName,
        Uri keepItem
    ) {
        String[] projection = new String[] { MediaStore.MediaColumns._ID };
        String selection = MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " + MediaStore.MediaColumns.RELATIVE_PATH + "=?";
        String[] args = new String[] { fileName, relativePath };

        try (Cursor cursor = resolver.query(collection, projection, selection, args, null)) {
            if (cursor == null) return;

            int idColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID);
            while (cursor.moveToNext()) {
                long id = cursor.getLong(idColumn);
                Uri item = Uri.withAppendedPath(collection, String.valueOf(id));
                if (item.equals(keepItem)) continue;
                try {
                    resolver.delete(item, null, null);
                } catch (SecurityException ignored) {
                    // If the old file belongs to another app, Android may refuse deletion.
                    // MediaStore can still create the new export entry.
                }
            }
        } catch (Exception ignored) {
            // Export should still proceed even if cleanup is blocked by scoped storage.
        }
    }

    private String writeLegacy(String folder, String fileName, InputStream source) throws Exception {
        File documents = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
        File outputDir = folder.isEmpty() ? documents : new File(documents, folder);
        if (!outputDir.exists() && !outputDir.mkdirs()) {
            throw new Exception("Unable to create export folder");
        }

        File output = new File(outputDir, fileName);
        AtomicFileWriter.replace(
            output,
            source,
            (pending, target) -> Os.rename(pending.getAbsolutePath(), target.getAbsolutePath())
        );

        return output.getAbsolutePath();
    }

    private void discardPreparedExport(String token) {
        if (committingExports.containsKey(token)) return;
        File pending = preparedExports.remove(token);
        if (pending != null) pending.delete();
    }

    private void finishCommittedExport(String token, File pending) {
        committingExports.remove(token);
        preparedExports.remove(token, pending);
        pending.delete();
    }

    private String sanitizeRelativePath(String path) {
        if (path == null) return "";
        return path.replace("\\", "/").replaceAll("^/+", "").replaceAll("/+$", "").replace("..", "");
    }

    private String sanitizeFileName(String fileName) {
        if (fileName == null) return "";
        return fileName
            .replace("\\", "_")
            .replace("/", "_")
            .replace("..", "_")
            .replaceAll("[\\p{Cntrl}<>:\"|?*]", "_")
            .trim();
    }

    @Override
    protected void handleOnDestroy() {
        exportExecutor.shutdownNow();
        for (File pending : preparedExports.values()) pending.delete();
        preparedExports.clear();
        committingExports.clear();
        super.handleOnDestroy();
    }
}
