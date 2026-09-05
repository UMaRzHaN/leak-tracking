package com.leak.tracking;

import java.io.File;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Временные архивы синхронизации в кэше: как их узнать, сколько им позволено
 * занимать и когда они перестают быть нужными.
 *
 * Само состояние — какой архив кому обещан и сколько байт забронировано —
 * осталось в плагине под его замком: оно вплетено в протокол, и переносить
 * вместе с ним дисциплину блокировок значило бы менять то, за чем этот класс
 * как раз и должен присматривать. Сюда уехало решение, а не владение: имена,
 * арифметика квоты и обход кэша. Это же и делает их проверяемыми — на
 * настоящем каталоге и настоящих файлах, чего внутри плагина не сделать.
 */
final class SyncArchiveFiles {

    /**
     * Префиксы всех четырёх ролей: исходящий, входящий, ответный и импортный.
     * Одним списком, потому что и уборка, и опознание файла должны говорить об
     * одном и том же множестве — разойдясь, они оставили бы в кэше файл,
     * который никто не считает своим.
     */
    static final String[] PREFIXES = {
        "local-sync-outgoing-",
        "local-sync-incoming-",
        "local-sync-response-",
        "local-sync-import-",
    };

    static final String SUFFIX = ".zip";

    private SyncArchiveFiles() {}

    static boolean isTemporaryArchiveName(String name) {
        if (name == null) return false;
        for (String prefix : PREFIXES) {
            if (name.startsWith(prefix)) return true;
        }
        return false;
    }

    /** Временные архивы, лежащие в кэше прямо сейчас, чьи бы они ни были. */
    static ArrayList<File> onDisk(File cacheDir) {
        ArrayList<File> files = new ArrayList<>();
        if (cacheDir == null) return files;
        File[] candidates = cacheDir.listFiles(file -> file.isFile() && isTemporaryArchiveName(file.getName()));
        if (candidates != null) {
            for (File file : candidates) files.add(file);
        }
        return files;
    }

    /**
     * Хватит ли места ещё на `additionalBytes` сверх уже забронированного.
     *
     * Отрицательное и переполняющееся считается превышением: бронь, ушедшая в
     * минус или за край `long`, прошла бы любую проверку и сняла бы ограничение
     * вовсе.
     */
    static boolean wouldExceedQuota(
        File cacheDir,
        long reservedBytes,
        long additionalBytes,
        long maxBytes
    ) {
        if (additionalBytes < 0L || reservedBytes < 0L) return true;
        if (Long.MAX_VALUE - reservedBytes < additionalBytes) return true;
        return TempFilePolicy.wouldExceedAggregate(
            onDisk(cacheDir),
            reservedBytes + additionalBytes,
            maxBytes
        );
    }

    /** Убирает из кэша брошенные архивы, не трогая те, что кому-то обещаны. */
    static void sweepOrphans(File cacheDir, Collection<File> protectedFiles, long now, long ttlMs) {
        if (cacheDir == null) return;
        for (String prefix : PREFIXES) {
            TempFilePolicy.sweepExpired(cacheDir, prefix, SUFFIX, now, ttlMs, protectedFiles);
        }
    }

    /**
     * Убирает записи, чей архив пережил свой срок.
     *
     * Удаление идёт через `remove(key, value)`: между проверкой срока и
     * удалением запись могли подменить, и безусловный `remove` унёс бы чужой,
     * только что положенный архив.
     */
    static void sweepExpiredEntries(ConcurrentHashMap<String, File> archives, long now, long ttlMs) {
        for (Map.Entry<String, File> entry : archives.entrySet()) {
            File archive = entry.getValue();
            if (TempFilePolicy.isExpired(archive, now, ttlMs) && archives.remove(entry.getKey(), archive)) {
                archive.delete();
            }
        }
    }
}
