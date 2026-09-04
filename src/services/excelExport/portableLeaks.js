import {
  EVENT_PHOTO_FIELDS,
  LEAK_PHOTO_FIELDS as PHOTO_KEYS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";
import {
  getEventPhotoMapKey,
  getLeakPhotoPath,
  getMonitoringPhotoMapKey,
} from "./photoIdentity";

/**
 * Записи, переписанные с путей устройства на имена файлов книги.
 *
 * Путь вида `idb://` за пределами устройства не значит ничего, поэтому снимок,
 * которому места в книге не нашлось, поле теряет: оставить путь значило бы
 * обещать фото, которого в файле нет.
 */
export function buildPortableLeaks(leaks, photoMap) {
  return leaks.map((leak, leakIndex) => {
    const copy = { ...leak };
    for (const key of PHOTO_KEYS) {
      const photoFileName = photoMap[`${leakIndex}:${key}`];
      if (photoFileName) {
        copy[key] = `zip:${photoFileName}`;
      } else if (
        copy[key] != null &&
        !String(copy[key]).startsWith("data:image/")
      ) {
        delete copy[key];
      }
    }

    // Путь на устройстве → имя файла в книге. Лента переиспользует его: осмотр
    // и его событие несут один и тот же снимок, и второй записи он не требует.
    const archived = new Map();
    for (const key of PHOTO_KEYS) {
      const photoFileName = photoMap[`${leakIndex}:${key}`];
      const path = getLeakPhotoPath(leak, key);
      if (photoFileName && path != null) {
        archived.set(String(path), `zip:${photoFileName}`);
      }
    }

    if (Array.isArray(copy.monitoringRecords)) {
      copy.monitoringRecords = copy.monitoringRecords.map(
        (record, recordIndex) => {
          const recordCopy = { ...record };
          for (const photoKey of MONITORING_PHOTO_FIELDS) {
            const photoFileName =
              photoMap[
                getMonitoringPhotoMapKey(leakIndex, recordIndex, photoKey)
              ];
            if (photoFileName) {
              recordCopy[photoKey] = `zip:${photoFileName}`;
              if (record?.[photoKey] != null) {
                archived.set(String(record[photoKey]), `zip:${photoFileName}`);
              }
              continue;
            }
            if (
              record?.[photoKey] != null &&
              !String(record[photoKey]).startsWith("data:image/")
            ) {
              delete recordCopy[photoKey];
            }
          }
          return recordCopy;
        },
      );
    }

    if (Array.isArray(copy.events)) {
      copy.events = copy.events.map((event, eventIndex) => {
        const eventCopy = { ...event };
        for (const photoKey of EVENT_PHOTO_FIELDS) {
          const path = event?.[photoKey];
          if (path == null) continue;

          // Сначала общий снимок: осмотр и его событие несут один и тот же
          // файл, и второй копии в книге у него нет.
          const shared = archived.get(String(path));
          if (shared) {
            eventCopy[photoKey] = shared;
            continue;
          }

          const own =
            photoMap[getEventPhotoMapKey(leakIndex, eventIndex, photoKey)];
          if (own) {
            eventCopy[photoKey] = `zip:${own}`;
            archived.set(String(path), `zip:${own}`);
            continue;
          }

          // Снимка нет среди выгруженных — значит, прочитать его не удалось.
          // Оставить путь устройства значило бы обещать фото, которого в
          // файле нет.
          if (!String(path).startsWith("data:image/")) {
            delete eventCopy[photoKey];
          }
        }
        return eventCopy;
      });
    }

    return copy;
  });
}
