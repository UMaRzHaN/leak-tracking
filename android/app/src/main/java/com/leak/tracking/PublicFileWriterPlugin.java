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
import java.io.OutputStream;

@CapacitorPlugin(name = "PublicFileWriter")
public class PublicFileWriterPlugin extends Plugin {

    @PluginMethod
    public void write(PluginCall call) {
        String folder = call.getString("folder", "");
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("data");

        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("fileName is required");
            return;
        }

        if (base64 == null) {
            call.reject("data is required");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            String safeFolder = sanitizeRelativePath(folder);
            String safeFileName = sanitizeFileName(fileName);
            if (safeFileName.isEmpty()) {
                throw new Exception("fileName contains no valid characters");
            }
            String savedPath = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? writeWithMediaStore(safeFolder, safeFileName, mimeType, bytes)
                : writeLegacy(safeFolder, safeFileName, bytes);

            JSObject result = new JSObject();
            result.put("path", savedPath);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private String writeWithMediaStore(String folder, String fileName, String mimeType, byte[] bytes) throws Exception {
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
                stream.write(bytes);
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

    private String writeLegacy(String folder, String fileName, byte[] bytes) throws Exception {
        File documents = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
        File outputDir = folder.isEmpty() ? documents : new File(documents, folder);
        if (!outputDir.exists() && !outputDir.mkdirs()) {
            throw new Exception("Unable to create export folder");
        }

        File output = new File(outputDir, fileName);
        AtomicFileWriter.replace(
            output,
            bytes,
            (source, target) -> Os.rename(source.getAbsolutePath(), target.getAbsolutePath())
        );

        return output.getAbsolutePath();
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
}
