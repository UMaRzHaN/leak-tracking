package com.leak.tracking;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

/**
 * Что делать с файлом базы, который SQLite объявил испорченным.
 *
 * Обработчик по умолчанию в Android на это удаляет файл базы вместе с журналом
 * и открывает пустую. В одном файле лежат все проекты устройства, а повод —
 * любая испорченная страница, на которую наткнулся любой запрос. Порча чаще
 * всего частичная: из такого файла почти всё ещё можно вытащить, но только
 * пока он существует.
 *
 * Поэтому здесь файл не удаляется, а копируется рядом — вместе с журналом WAL
 * и разделяемой памятью, без которых последние записи из него не достать.
 * Оригинал остаётся на месте: запрос, наткнувшийся на порчу, падает с ошибкой,
 * приложение показывает её вместо пустого проекта, и данные никто не затирает.
 *
 * Копия снимается один раз за запуск: запрос за запросом натыкался бы на ту же
 * страницу, и каждая копия съедала бы ещё один размер базы.
 */
final class CorruptDatabaseQuarantine {
    static final String SUFFIX = ".corrupt-";
    private static final String[] COMPANIONS = { "", "-wal", "-shm", "-journal" };

    private static final Object LOCK = new Object();
    private static final List<String> quarantined = new ArrayList<>();

    private CorruptDatabaseQuarantine() {}

    /**
     * Копирует файл базы и его спутники под именем с отметкой времени.
     *
     * @return скопированные файлы; пустой список — если копия за этот запуск
     *     уже снята или файла базы нет
     */
    static List<File> preserve(File database, long timestamp) {
        List<File> copies = new ArrayList<>();
        if (database == null || !database.isFile()) return copies;
        synchronized (LOCK) {
            String key = database.getAbsolutePath();
            if (quarantined.contains(key)) return copies;
            quarantined.add(key);
        }
        for (String suffix : COMPANIONS) {
            File source = new File(database.getPath() + suffix);
            if (!source.isFile()) continue;
            File target = new File(database.getPath() + SUFFIX + timestamp + suffix);
            try {
                Files.copy(
                    source.toPath(),
                    target.toPath(),
                    StandardCopyOption.COPY_ATTRIBUTES
                );
                copies.add(target);
            } catch (IOException ignored) {
                // Копия — подстраховка, а не условие: даже без неё оригинал
                // остаётся на месте, потому что здесь его никто не удаляет.
            }
        }
        return copies;
    }

    /** Точка входа обработчика порчи SQLite: путь как его отдаёт база. */
    static List<File> preserve(String path, long timestamp) {
        System.err.println(
            "LeakDatabaseStore: SQLite reported corruption in " + path
                + "; keeping the file instead of deleting it"
        );
        if (path == null || path.isEmpty() || ":memory:".equals(path)) {
            return new ArrayList<>();
        }
        return preserve(new File(path), timestamp);
    }

    static void resetForTests() {
        synchronized (LOCK) {
            quarantined.clear();
        }
    }
}
