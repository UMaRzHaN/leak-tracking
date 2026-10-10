package com.leak.tracking;

import java.io.InputStream;
import java.util.UUID;

/**
 * Порядок замены прошлого экспорта новым, без MediaStore — чтобы его можно
 * было проверить обычным юнит-тестом.
 *
 * Прошлый файл с тем же именем удаляется только тогда, когда новый уже записан
 * целиком и опубликован под временным именем. Нехватка места, ошибка записи
 * или убитый посреди неё процесс оставляют прошлый бэкап нетронутым, а
 * недописанная копия так и остаётся в IS_PENDING, где её подбирает сам
 * MediaStore. Хуже всего — процесс убит между публикацией и переименованием:
 * тогда рядом лежат обе копии, старая и новая под временным именем, но
 * пропавших нет; временную убирает следующий удачный экспорт.
 */
final class ReplacingExport {
    /** Хранилище, куда пишется экспорт: на устройстве — MediaStore. */
    interface Store<T> {
        /** Создаёт скрытую (IS_PENDING=1) запись под именем name. */
        T createPending(String name) throws Exception;

        void write(T item, InputStream source) throws Exception;

        /** Снимает IS_PENDING; файл становится виден под своим текущим именем. */
        void publish(T item) throws Exception;

        /** Удаляет файлы с именем name, кроме keep; отказ в удалении — не ошибка. */
        void deleteOthersNamed(String name, T keep);

        /**
         * Удаляет файлы, имя которых — временное имя экспорта fileName
         * (см. {@link #isTemporaryOf}), кроме keep; отказ — не ошибка.
         */
        void deleteTemporariesOf(String fileName, T keep);

        /** @return имя, которое файл носит после попытки переименования */
        String renameTo(T item, String name);

        /** Убирает недописанную или неопубликованную запись. */
        void discard(T item);
    }

    private static final String TEMP_PREFIX = "export-";

    private ReplacingExport() {}

    /**
     * Временное имя оставляет исходное расширение в конце: MediaStore сверяет
     * его с MIME-типом и к чужому расширению дописал бы своё.
     */
    static String temporaryName(String fileName) {
        return TEMP_PREFIX + UUID.randomUUID().toString().substring(0, 8) + "-" + fileName;
    }

    /** Имя — временное имя экспорта fileName: export-<8 hex>-<fileName>. */
    static boolean isTemporaryOf(String candidate, String fileName) {
        if (candidate == null || fileName == null) return false;
        String head = TEMP_PREFIX;
        int idLength = 8;
        if (candidate.length() != head.length() + idLength + 1 + fileName.length()) return false;
        if (!candidate.startsWith(head) || !candidate.endsWith("-" + fileName)) return false;
        for (int i = head.length(); i < head.length() + idLength; i++) {
            char c = candidate.charAt(i);
            boolean hex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
            if (!hex) return false;
        }
        return true;
    }

    /** @return имя, под которым экспорт в итоге лежит */
    static <T> String write(Store<T> store, String fileName, InputStream source) throws Exception {
        T item = store.createPending(temporaryName(fileName));
        if (item == null) throw new Exception("Unable to create export file");

        boolean published = false;
        try {
            store.write(item, source);
            store.publish(item);
            published = true;
        } finally {
            if (!published) store.discard(item);
        }

        // Новый файл уже цел и виден — только теперь место под имя
        // освобождается. Файл, который приложению удалять не дали (его
        // записала другая сборка, например), остаётся, и тогда MediaStore
        // даст новому суффикс — вызывающему вернётся настоящее имя.
        store.deleteOthersNamed(fileName, item);
        String storedName = store.renameTo(item, fileName);

        // Копия под временным именем остаётся, если прошлый экспорт убили
        // между публикацией и переименованием. Убирается она только сейчас,
        // когда новый экспорт цел и на месте: до этого она могла быть
        // единственным свежим бэкапом.
        store.deleteTemporariesOf(fileName, item);
        return storedName;
    }
}
