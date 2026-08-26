package com.leak.tracking;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

final class LeakDatabaseStore implements AutoCloseable {
    static final String DATABASE_NAME = "leak_tracking.db";
    private static final int DATABASE_VERSION = 1;
    private static final int STORAGE_SCHEMA_VERSION = 1;

    static final class ProjectData {
        final boolean found;
        final String recordsJson;
        final String syncStateJson;
        final long updatedAt;

        ProjectData(boolean found, String recordsJson, String syncStateJson, long updatedAt) {
            this.found = found;
            this.recordsJson = recordsJson;
            this.syncStateJson = syncStateJson;
            this.updatedAt = updatedAt;
        }
    }

    /**
     * Result of a paged read — see {@link #loadProjectPage}.
     */
    static final class ProjectPage {
        final boolean found;
        final String recordsJson;
        final int totalCount;
        final int offset;
        final int limit;
        final boolean hasMore;
        final long updatedAt;

        ProjectPage(
            boolean found,
            String recordsJson,
            int totalCount,
            int offset,
            int limit,
            boolean hasMore,
            long updatedAt
        ) {
            this.found = found;
            this.recordsJson = recordsJson;
            this.totalCount = totalCount;
            this.offset = offset;
            this.limit = limit;
            this.hasMore = hasMore;
            this.updatedAt = updatedAt;
        }
    }

    static final class Diagnostics {
        final boolean found;
        final int recordCount;
        final long updatedAt;
        final String lastWriteMode;
        final int lastChangeCount;
        final long databaseBytes;
        final long walBytes;

        Diagnostics(
            boolean found,
            int recordCount,
            long updatedAt,
            String lastWriteMode,
            int lastChangeCount,
            long databaseBytes,
            long walBytes
        ) {
            this.found = found;
            this.recordCount = recordCount;
            this.updatedAt = updatedAt;
            this.lastWriteMode = lastWriteMode;
            this.lastChangeCount = lastChangeCount;
            this.databaseBytes = databaseBytes;
            this.walBytes = walBytes;
        }
    }

    private static final class RecordRow {
        final String id;
        final String payload;

        RecordRow(String id, String payload) {
            this.id = id;
            this.payload = payload;
        }
    }

    private final Context context;
    private final DatabaseHelper helper;

    LeakDatabaseStore(Context context) {
        this.context = context.getApplicationContext();
        this.helper = new DatabaseHelper(this.context);
        this.helper.setWriteAheadLoggingEnabled(true);
    }

    synchronized ProjectData loadProject(String rawProjectKey) throws Exception {
        String projectKey = validateProjectKey(rawProjectKey);
        SQLiteDatabase database = helper.getReadableDatabase();
        String syncStateJson = null;
        long updatedAt = 0L;
        try (
            Cursor project = database.query(
                "projects",
                new String[] { "sync_state_json", "updated_at" },
                "project_key = ?",
                new String[] { projectKey },
                null,
                null,
                null,
                "1"
            )
        ) {
            if (!project.moveToFirst()) {
                return new ProjectData(false, "[]", null, 0L);
            }
            syncStateJson = project.isNull(0) ? null : project.getString(0);
            updatedAt = project.getLong(1);
        }

        StringBuilder recordsJson = new StringBuilder("[");
        try (
            Cursor cursor = database.query(
                "leaks",
                new String[] { "payload_json" },
                "project_key = ?",
                new String[] { projectKey },
                null,
                null,
                "position ASC"
            )
        ) {
            boolean first = true;
            while (cursor.moveToNext()) {
                if (!first) recordsJson.append(',');
                recordsJson.append(cursor.getString(0));
                first = false;
            }
        }
        recordsJson.append(']');
        return new ProjectData(true, recordsJson.toString(), syncStateJson, updatedAt);
    }

    /**
     * Reads one page of leak rows ordered by the same {@code position} column
     * used by {@link #loadProject}, using the existing
     * {@code leaks_project_position} index so LIMIT/OFFSET stays an indexed
     * range scan rather than a full-table sort. Unlike loadProject, this does
     * not include sync_state_json — callers that need it should read it once
     * from the first page (offset 0) rather than on every page.
     *
     * <p>This is additive, currently-unwired infrastructure:
     * {@link #loadProject} is still what {@code NativeLeakStoragePlugin#load}
     * and every JS caller actually use. Nothing in the app calls
     * loadProjectPage yet — wiring a page-by-page read through
     * Settings/Monitoring/MainPage/search, i.e. moving from a whole-array
     * project to record-level reads, is a larger, separate change. This
     * method exists so
     * that future work has a tested, working native primitive to build on
     * without touching the existing read path.
     */
    synchronized ProjectPage loadProjectPage(
        String rawProjectKey,
        int offset,
        int limit
    ) throws Exception {
        String projectKey = validateProjectKey(rawProjectKey);
        if (offset < 0) throw new IllegalArgumentException("offset must not be negative");
        if (limit <= 0 || limit > 2000) {
            throw new IllegalArgumentException("limit must be between 1 and 2000");
        }
        SQLiteDatabase database = helper.getReadableDatabase();

        long updatedAt = 0L;
        try (
            Cursor project = database.query(
                "projects",
                new String[] { "updated_at" },
                "project_key = ?",
                new String[] { projectKey },
                null,
                null,
                null,
                "1"
            )
        ) {
            if (!project.moveToFirst()) {
                return new ProjectPage(false, "[]", 0, offset, limit, false, 0L);
            }
            updatedAt = project.getLong(0);
        }

        int totalCount;
        try (
            Cursor count = database.rawQuery(
                "SELECT COUNT(*) FROM leaks WHERE project_key = ?",
                new String[] { projectKey }
            )
        ) {
            totalCount = count.moveToFirst() ? count.getInt(0) : 0;
        }

        StringBuilder recordsJson = new StringBuilder("[");
        try (
            Cursor cursor = database.query(
                "leaks",
                new String[] { "payload_json" },
                "project_key = ?",
                new String[] { projectKey },
                null,
                null,
                "position ASC",
                // `LIMIT <offset>,<count>`, а не `LIMIT <count> OFFSET
                // <offset>`: SQLiteQueryBuilder проверяет эту строку своим
                // шаблоном, и на Android 7 тот принимает только цифры с
                // запятой — форма со словом OFFSET там падает с
                // `IllegalArgumentException: invalid LIMIT clauses`. Смысл
                // у форм один, но в запятой смещение идёт первым.
                // minSdk у приложения 24, так что проверять это некому,
                // кроме инструментального теста на самом низком уровне.
                offset + "," + limit
            )
        ) {
            boolean first = true;
            while (cursor.moveToNext()) {
                if (!first) recordsJson.append(',');
                recordsJson.append(cursor.getString(0));
                first = false;
            }
        }
        recordsJson.append(']');

        boolean hasMore = offset + limit < totalCount;
        return new ProjectPage(true, recordsJson.toString(), totalCount, offset, limit, hasMore, updatedAt);
    }

    synchronized void replaceAll(
        String rawProjectKey,
        JSONArray records,
        String syncStateJson
    ) throws Exception {
        String projectKey = validateProjectKey(rawProjectKey);
        validateJsonValue(syncStateJson, "sync state");
        List<RecordRow> rows = normalizeRecords(records);
        SQLiteDatabase database = helper.getWritableDatabase();
        database.beginTransactionNonExclusive();
        try {
            upsertProjectMetadata(
                database,
                projectKey,
                syncStateJson,
                "replace",
                rows.size()
            );
            database.delete("leaks", "project_key = ?", new String[] { projectKey });
            int position = 0;
            for (RecordRow row : rows) {
                ContentValues values = new ContentValues();
                values.put("project_key", projectKey);
                values.put("leak_id", row.id);
                values.put("position", position++);
                values.put("payload_json", row.payload);
                long inserted = database.insertOrThrow("leaks", null, values);
                if (inserted < 0) throw new IllegalStateException("Could not insert leak record");
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    synchronized boolean applyChanges(
        String rawProjectKey,
        JSONArray upserts,
        JSONArray deletedIds,
        String syncStateJson
    ) throws Exception {
        String projectKey = validateProjectKey(rawProjectKey);
        validateJsonValue(syncStateJson, "sync state");
        List<RecordRow> rows = normalizeRecords(upserts);
        List<String> idsToDelete = normalizeIds(deletedIds);
        SQLiteDatabase database = helper.getWritableDatabase();
        database.beginTransactionNonExclusive();
        try {
            if (!projectExists(database, projectKey)) return false;

            for (String id : idsToDelete) {
                database.delete(
                    "leaks",
                    "project_key = ? AND leak_id = ?",
                    new String[] { projectKey, id }
                );
            }

            int nextPosition = queryNextPosition(database, projectKey);
            for (RecordRow row : rows) {
                ContentValues update = new ContentValues();
                update.put("payload_json", row.payload);
                int changed = database.update(
                    "leaks",
                    update,
                    "project_key = ? AND leak_id = ?",
                    new String[] { projectKey, row.id }
                );
                if (changed == 0) {
                    ContentValues insert = new ContentValues();
                    insert.put("project_key", projectKey);
                    insert.put("leak_id", row.id);
                    insert.put("position", nextPosition++);
                    insert.put("payload_json", row.payload);
                    database.insertOrThrow("leaks", null, insert);
                }
            }

            upsertProjectMetadata(
                database,
                projectKey,
                syncStateJson,
                "incremental",
                rows.size() + idsToDelete.size()
            );
            database.setTransactionSuccessful();
            return true;
        } finally {
            database.endTransaction();
        }
    }

    synchronized Diagnostics diagnostics(String rawProjectKey) throws Exception {
        String projectKey = validateProjectKey(rawProjectKey);
        SQLiteDatabase database = helper.getReadableDatabase();
        boolean found = false;
        long updatedAt = 0L;
        String lastWriteMode = null;
        int lastChangeCount = 0;
        try (
            Cursor project = database.query(
                "projects",
                new String[] { "updated_at", "last_write_mode", "last_change_count" },
                "project_key = ?",
                new String[] { projectKey },
                null,
                null,
                null,
                "1"
            )
        ) {
            if (project.moveToFirst()) {
                found = true;
                updatedAt = project.getLong(0);
                lastWriteMode = project.getString(1);
                lastChangeCount = project.getInt(2);
            }
        }
        int recordCount = 0;
        if (found) {
            try (
                Cursor count = database.rawQuery(
                    "SELECT COUNT(*) FROM leaks WHERE project_key = ?",
                    new String[] { projectKey }
                )
            ) {
                if (count.moveToFirst()) recordCount = count.getInt(0);
            }
        }
        File main = context.getDatabasePath(DATABASE_NAME);
        File wal = new File(main.getPath() + "-wal");
        return new Diagnostics(
            found,
            recordCount,
            updatedAt,
            lastWriteMode,
            lastChangeCount,
            main.exists() ? main.length() : 0L,
            wal.exists() ? wal.length() : 0L
        );
    }

    synchronized void deleteProject(String rawProjectKey) throws Exception {
        String projectKey = validateProjectKey(rawProjectKey);
        SQLiteDatabase database = helper.getWritableDatabase();
        database.beginTransactionNonExclusive();
        try {
            database.delete("leaks", "project_key = ?", new String[] { projectKey });
            database.delete("projects", "project_key = ?", new String[] { projectKey });
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private static void upsertProjectMetadata(
        SQLiteDatabase database,
        String projectKey,
        String syncStateJson,
        String writeMode,
        int changeCount
    ) {
        ContentValues values = new ContentValues();
        values.put("project_key", projectKey);
        if (syncStateJson == null) values.putNull("sync_state_json");
        else values.put("sync_state_json", syncStateJson);
        values.put("updated_at", System.currentTimeMillis());
        values.put("schema_version", STORAGE_SCHEMA_VERSION);
        values.put("last_write_mode", writeMode);
        values.put("last_change_count", changeCount);
        int updated = database.update(
            "projects",
            values,
            "project_key = ?",
            new String[] { projectKey }
        );
        if (updated == 0) database.insertOrThrow("projects", null, values);
    }

    private static boolean projectExists(SQLiteDatabase database, String projectKey) {
        try (
            Cursor cursor = database.rawQuery(
                "SELECT 1 FROM projects WHERE project_key = ? LIMIT 1",
                new String[] { projectKey }
            )
        ) {
            return cursor.moveToFirst();
        }
    }

    private static int queryNextPosition(SQLiteDatabase database, String projectKey) {
        try (
            Cursor cursor = database.rawQuery(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM leaks WHERE project_key = ?",
                new String[] { projectKey }
            )
        ) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    private static List<RecordRow> normalizeRecords(JSONArray records) throws Exception {
        if (records == null) throw new IllegalArgumentException("records are required");
        List<RecordRow> rows = new ArrayList<>(records.length());
        Set<String> ids = new HashSet<>();
        for (int index = 0; index < records.length(); index++) {
            JSONObject record = records.optJSONObject(index);
            if (record == null) throw new IllegalArgumentException("Every leak record must be an object");
            Object rawId = record.opt("id");
            if (!(rawId instanceof String) && !(rawId instanceof Number)) {
                throw new IllegalArgumentException("Every leak record must have a string or numeric id");
            }
            String id = String.valueOf(rawId);
            if (id.isEmpty() || !ids.add(id)) {
                throw new IllegalArgumentException("Leak identifiers must be unique and non-empty");
            }
            rows.add(new RecordRow(id, record.toString()));
        }
        return rows;
    }

    private static List<String> normalizeIds(JSONArray rawIds) {
        if (rawIds == null) throw new IllegalArgumentException("deletedIds are required");
        List<String> ids = new ArrayList<>(rawIds.length());
        Set<String> unique = new HashSet<>();
        for (int index = 0; index < rawIds.length(); index++) {
            Object value = rawIds.opt(index);
            if (!(value instanceof String) && !(value instanceof Number)) {
                throw new IllegalArgumentException("Deleted identifiers must be strings or numbers");
            }
            String id = String.valueOf(value);
            if (!id.isEmpty() && unique.add(id)) ids.add(id);
        }
        return ids;
    }

    private static String validateProjectKey(String value) {
        if (value == null) throw new IllegalArgumentException("projectKey is required");
        String key = value.trim();
        if (key.isEmpty() || key.length() > 200) {
            throw new IllegalArgumentException("projectKey must contain 1 to 200 characters");
        }
        for (int index = 0; index < key.length(); index++) {
            if (Character.isISOControl(key.charAt(index))) {
                throw new IllegalArgumentException("projectKey contains control characters");
            }
        }
        return key;
    }

    private static void validateJsonValue(String value, String label) throws Exception {
        if (value == null) return;
        Object parsed = new JSONTokener(value).nextValue();
        if (parsed == null || parsed == JSONObject.NULL) {
            throw new IllegalArgumentException(label + " must contain a JSON value");
        }
    }

    @Override
    public synchronized void close() {
        helper.close();
    }

    private static final class DatabaseHelper extends SQLiteOpenHelper {
        DatabaseHelper(Context context) {
            super(context, DATABASE_NAME, null, DATABASE_VERSION);
        }

        @Override
        public void onConfigure(SQLiteDatabase database) {
            super.onConfigure(database);
            database.setForeignKeyConstraintsEnabled(true);
        }

        @Override
        public void onCreate(SQLiteDatabase database) {
            database.execSQL(
                "CREATE TABLE projects (" +
                    "project_key TEXT PRIMARY KEY NOT NULL," +
                    "sync_state_json TEXT," +
                    "updated_at INTEGER NOT NULL," +
                    "schema_version INTEGER NOT NULL," +
                    "last_write_mode TEXT NOT NULL," +
                    "last_change_count INTEGER NOT NULL DEFAULT 0" +
                ")"
            );
            database.execSQL(
                "CREATE TABLE leaks (" +
                    "project_key TEXT NOT NULL," +
                    "leak_id TEXT NOT NULL," +
                    "position INTEGER NOT NULL," +
                    "payload_json TEXT NOT NULL," +
                    "PRIMARY KEY(project_key, leak_id)," +
                    "FOREIGN KEY(project_key) REFERENCES projects(project_key) ON DELETE CASCADE" +
                ")"
            );
            database.execSQL(
                "CREATE UNIQUE INDEX leaks_project_position " +
                    "ON leaks(project_key, position)"
            );
        }

        @Override
        public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
            throw new IllegalStateException(
                "Unsupported leak database migration from " + oldVersion + " to " + newVersion
            );
        }
    }
}
