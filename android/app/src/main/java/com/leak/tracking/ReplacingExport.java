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
 * пропавших нет.
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
        return store.renameTo(item, fileName);
    }
}
