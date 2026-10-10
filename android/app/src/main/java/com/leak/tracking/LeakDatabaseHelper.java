package com.leak.tracking;

import android.content.Context;
import android.database.DatabaseErrorHandler;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

/**
 * Схема файла базы и то, как он открывается. Вынесено из LeakDatabaseStore:
 * там чтение и запись проектов, здесь — жизнь самого файла.
 */
final class LeakDatabaseHelper extends SQLiteOpenHelper {
    private static final int DATABASE_VERSION = 1;

    LeakDatabaseHelper(Context context) {
        super(context, LeakDatabaseStore.DATABASE_NAME, null, DATABASE_VERSION, PRESERVE_ON_CORRUPTION);
    }

    // По умолчанию Android удаляет испорченную базу (а в ней все проекты);
    // здесь она только копируется в сторону — см. CorruptDatabaseQuarantine.
    private static final DatabaseErrorHandler PRESERVE_ON_CORRUPTION = database ->
        CorruptDatabaseQuarantine.preserve(database.getPath(), System.currentTimeMillis());

    // WAL в NORMAL может потерять уже подтверждённую запись при отказе питания.
    @Override
    public void onOpen(SQLiteDatabase database) {
        super.onOpen(database);
        database.execSQL("PRAGMA synchronous=FULL");
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
