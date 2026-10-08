package com.leak.tracking;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
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
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "PublicFileWriter")
public class PublicFileWriterPlugin extends Plugin {
    private static final long MAX_EXPORT_BYTES = 1024L * 1024L * 1024L;
    private static final int MAX_CHUNK_BYTES = 1024 * 1024;
    private static final int MAX_PREPARED_EXPORTS = 3;
    private static final long MAX_PREPARED_EXPORT_BYTES = MAX_EXPORT_BYTES;
    private static final long PREPARED_EXPORT_TTL_MS = TimeUnit.MINUTES.toMillis(15);
    private final ConcurrentHashMap<String, File> preparedExports = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Boolean> committingExports = new ConcurrentHashMap<>();
    private final Object preparedExportLock = new Object();
    private final ExecutorService exportExecutor = Executors.newSingleThreadExecutor();
    private final ScheduledThreadPoolExecutor cleanupExecutor = createCleanupExecutor();

    @Override
    public void load() {
        cleanupOrphanedExportFiles();
        // Fixed delay, not fixed rate: a cached process suppresses the timer,
        // and a fixed rate then fires every missed run back to back the moment
        // the process wakes up.
        cleanupExecutor.scheduleWithFixedDelay(
            this::cleanupExpiredPreparedExports,
            1,
            1,
            TimeUnit.MINUTES
        );
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        try {
            String token;
            synchronized (preparedExportLock) {
                cleanupExpiredPreparedExportsLocked();
                if (
                    !TempFilePolicy.hasSessionCapacity(
                        preparedExports.size(),
                        MAX_PREPARED_EXPORTS
                    )
                ) {
                    throw new Exception("Too many prepared exports are active");
                }
                if (
                    TempFilePolicy.wouldExceedAggregate(
                        preparedExports.values(),
                        1L,
                        MAX_PREPARED_EXPORT_BYTES
                    )
                ) {
                    throw new Exception("Prepared export storage quota is exhausted");
                }
                token = UUID.randomUUID().toString();
                File pending = File.createTempFile(
                    "public-export-",
                    ".pending",
                    getContext().getCacheDir()
                );
                TempFilePolicy.touch(pending, System.currentTimeMillis());
                preparedExports.put(token, pending);
            }
            JSObject result = new JSObject();
            result.put("token", token);
            result.put("maxExportBytes", MAX_EXPORT_BYTES);
            result.put("maxPreparedExports", MAX_PREPARED_EXPORTS);
            result.put("preparedExportTtlMs", PREPARED_EXPORT_TTL_MS);
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
            long size;
            synchronized (preparedExportLock) {
                if (
                    TempFilePolicy.isExpired(
                        pending,
                        System.currentTimeMillis(),
                        PREPARED_EXPORT_TTL_MS
                    )
                ) {
                    throw new Exception("Export token has expired");
                }
                if (
                    chunk.length > MAX_CHUNK_BYTES ||
                    TempFilePolicy.wouldExceedFile(
                        pending,
                        chunk.length,
                        MAX_EXPORT_BYTES
                    ) ||
                    TempFilePolicy.wouldExceedAggregate(
                        preparedExports.values(),
                        chunk.length,
                        MAX_PREPARED_EXPORT_BYTES
                    )
                ) {
                    throw new Exception("Export exceeds the safety limit");
                }
                try (FileOutputStream stream = new FileOutputStream(pending, true)) {
                    stream.write(chunk);
                }
                TempFilePolicy.touch(pending, System.currentTimeMillis());
                size = pending.length();
            }
            JSObject result = new JSObject();
            result.put("size", size);
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
        Long expectedSize = PluginNumbers.asLong(call.getData().opt("expectedSize"));
        String folder = call.getString("folder", "");
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        File pending;
        synchronized (preparedExportLock) {
            cleanupExpiredPreparedExportsLocked();
            pending = preparedExports.get(token);
            if (
                pending == null ||
                TempFilePolicy.isExpired(
                    pending,
                    System.currentTimeMillis(),
                    PREPARED_EXPORT_TTL_MS
                ) ||
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
            TempFilePolicy.touch(pending, System.currentTimeMillis());
        }

        try {
            exportExecutor.execute(() -> {
                try (InputStream source = new FileInputStream(pending)) {
                    String safeFolder = ExportPathSafety.sanitizeRelativePath(folder);
                    String safeFileName = sanitizeFileName(fileName);
                    if (safeFileName.isEmpty()) throw new Exception("fileName contains no valid characters");
                    String savedPath = writeWithMediaStore(safeFolder, safeFileName, mimeType, source);
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

    private String writeWithMediaStore(String folder, String fileName, String mimeType, InputStream source) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        Uri collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        String relativePath = Environment.DIRECTORY_DOCUMENTS + (folder.isEmpty() ? "/" : "/" + folder + "/");

        // Прошлый файл с тем же именем — это прошлый бэкап, и удалять его до
        // записи нового нельзя: нехватка места или убитый процесс оставляли
        // без обеих копий. Новый пишется под временным именем, старый
        // убирается, только когда новый опубликован, и лишь потом новому
        // возвращается запрошенное имя (MediaStore не даёт занять чужое имя —
        // молча сохранил бы "report (1).zip").
        String storedName = ReplacingExport.write(
            new ReplacingExport.Store<Uri>() {
                @Override
                public Uri createPending(String name) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    return resolver.insert(collection, values);
                }

                @Override
                public void write(Uri item, InputStream input) throws Exception {
                    try (OutputStream stream = resolver.openOutputStream(item, "w")) {
                        if (stream == null) {
                            throw new Exception("Unable to open export file");
                        }
                        byte[] buffer = new byte[64 * 1024];
                        int read;
                        while ((read = input.read(buffer)) >= 0) {
                            stream.write(buffer, 0, read);
                        }
                        stream.flush();
                    }
                }

                @Override
                public void publish(Uri item) throws Exception {
                    ContentValues done = new ContentValues();
                    done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    if (resolver.update(item, done, null, null) != 1) {
                        throw new Exception("Unable to publish export file");
                    }
                }

                @Override
                public void deleteOthersNamed(String name, Uri keep) {
                    deleteExistingFile(resolver, collection, relativePath, name, keep);
                }

                @Override
                public String renameTo(Uri item, String name) {
                    return renameToRequested(resolver, item, name);
                }

                @Override
                public void discard(Uri item) {
                    try {
                        resolver.delete(item, null, null);
                    } catch (Exception ignored) {}
                }
            },
            fileName,
            source
        );

        return "Documents/" + (folder.isEmpty() ? "" : folder + "/") + storedName;
    }

    /**
     * Puts the requested name back on a freshly published export.
     *
     * @return the name the file actually carries afterwards
     */
    private String renameToRequested(ContentResolver resolver, Uri item, String fileName) {
        try (
            Cursor cursor = resolver.query(
                item,
                new String[] { MediaStore.MediaColumns.DISPLAY_NAME },
                null,
                null,
                null
            )
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                String current = cursor.getString(0);
                if (fileName.equals(current)) return fileName;
            }
        } catch (Exception ignored) {
            // Unreadable name is not a reason to fail an export that is written.
        }

        try {
            ContentValues rename = new ContentValues();
            rename.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            // Ответ update() не говорит, какое имя досталось: занятое имя
            // MediaStore молча дополняет суффиксом. Поэтому имя перечитывается.
            resolver.update(item, rename, null, null);
        } catch (Exception ignored) {
            // Scoped storage may refuse the rename; the export itself stands.
        }

        try (
            Cursor cursor = resolver.query(
                item,
                new String[] { MediaStore.MediaColumns.DISPLAY_NAME },
                null,
                null,
                null
            )
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                String current = cursor.getString(0);
                if (current != null && !current.isEmpty()) return current;
            }
        } catch (Exception ignored) {
            // Fall through to the requested name.
        }
        return fileName;
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
                if (keepItem != null && id == ContentUris.parseId(keepItem)) continue;
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

    private static ScheduledThreadPoolExecutor createCleanupExecutor() {
        ScheduledThreadPoolExecutor executor = new ScheduledThreadPoolExecutor(1);
        executor.setRemoveOnCancelPolicy(true);
        return executor;
    }

    private void cleanupOrphanedExportFiles() {
        synchronized (preparedExportLock) {
            TempFilePolicy.sweepExpired(
                getContext().getCacheDir(),
                "public-export-",
                ".pending",
                System.currentTimeMillis(),
                PREPARED_EXPORT_TTL_MS,
                preparedExports.values()
            );
        }
    }

    private void cleanupExpiredPreparedExports() {
        synchronized (preparedExportLock) {
            cleanupExpiredPreparedExportsLocked();
        }
        cleanupOrphanedExportFiles();
    }

    private void cleanupExpiredPreparedExportsLocked() {
        long now = System.currentTimeMillis();
        for (java.util.Map.Entry<String, File> entry : preparedExports.entrySet()) {
            String token = entry.getKey();
            File pending = entry.getValue();
            if (
                !committingExports.containsKey(token) &&
                TempFilePolicy.isExpired(pending, now, PREPARED_EXPORT_TTL_MS) &&
                preparedExports.remove(token, pending)
            ) {
                pending.delete();
            }
        }
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
        cleanupExecutor.shutdownNow();
        for (File pending : preparedExports.values()) pending.delete();
        preparedExports.clear();
        committingExports.clear();
        super.handleOnDestroy();
    }
}
