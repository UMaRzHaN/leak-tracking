import { appError } from "@/utils/appError";
import { fingerprintBlob } from "@/utils/blobHash";
import { dataUrlToBlob } from "@/utils/photoConversion";
import { isArchivePhotoPath } from "@/services/backup/archivePhotoReader";
import {
  EVENT_PHOTO_KEYS,
  IMPORT_CONCURRENCY,
  MONITORING_PHOTO_KEYS,
  PHOTO_KEYS,
} from "./constants";
import { mapWithConcurrency } from "./runtime";

/**
 * Обратная сторона архива: снимки из файла обратно на устройство.
 *
 * Отделено от выгрузки, потому что вопросы разные. Выгрузка решает, какое имя
 * дать файлу и как не переписать один снимок дважды; восстановление — какой
 * путь записи считать ссылкой в архив, а какой оставить как есть.
 */
export async function restorePhotos(
  leaks,
  photos,
  savePhotoRefOrFn,
  { keyPrefix = "" } = {},
) {
  const savePhoto =
    typeof savePhotoRefOrFn === "function"
      ? savePhotoRefOrFn
      : savePhotoRefOrFn?.current;

  const archivePhotoSizes = [];
  const collectSize = (path) => {
    const size = photos.declaredSize(path);
    if (size > 0) archivePhotoSizes.push(size);
  };
  for (const leak of leaks) {
    for (const key of PHOTO_KEYS) collectSize(leak?.[key]);
    for (const record of leak?.monitoringRecords ?? []) {
      for (const key of MONITORING_PHOTO_KEYS) collectSize(record?.[key]);
    }
    for (const event of leak?.events ?? []) {
      for (const key of EVENT_PHOTO_KEYS) collectSize(event?.[key]);
    }
  }
  const totalPhotoBytes = archivePhotoSizes.reduce(
    (total, size) => total + size,
    0,
  );
  const largestPhotoBytes = Math.max(0, ...archivePhotoSizes);
  const concurrency =
    largestPhotoBytes > 8 * 1024 * 1024 || totalPhotoBytes > 32 * 1024 * 1024
      ? 1
      : totalPhotoBytes > 12 * 1024 * 1024
        ? 2
        : IMPORT_CONCURRENCY;

  const preparePhoto = async (path) => {
    if (isArchivePhotoPath(path)) {
      const blob = await photos.read(path);
      if (!blob) return null;
      return {
        blob,
        fallbackPath: null,
        contentHash: await fingerprintBlob(blob),
      };
    }
    if (path.startsWith("data:image/")) {
      const blob = dataUrlToBlob(path);
      if (!blob) return null;
      return {
        blob,
        fallbackPath: path,
        contentHash: await fingerprintBlob(blob),
      };
    }
    return null;
  };

  return mapWithConcurrency(leaks, concurrency, async (leak, leakIndex) => {
    if (!leak || typeof leak !== "object" || Array.isArray(leak)) return leak;
    const copy = { ...leak };
    const baseKey = `${keyPrefix}${String(
      leak.leak_id ?? leak.id ?? leakIndex + 1,
    )}`;
    const savedPaths = {};
    const restoredByArchivePath = new Map();

    for (const key of PHOTO_KEYS) {
      const path = leak[key];
      if (typeof path !== "string" || !path) continue;

      const prepared = await preparePhoto(path);
      if (!prepared) continue;

      const storageKey =
        key === "photo_after"
          ? `${baseKey}_after`
          : key === "photo_repair"
            ? `${baseKey}_repair`
            : baseKey;
      const excludePaths = Object.values(savedPaths);
      const newPath = await savePhoto(prepared.blob, storageKey, excludePaths, {
        cleanupOldVersions: false,
        contentHash: prepared.contentHash,
      });
      if (!newPath && path.startsWith("zip:")) {
        throw appError(
          "PHOTO_SAVE_FAILED",
          `Не удалось сохранить фотографию ${path}`,
          { path },
        );
      }
      copy[key] = newPath ?? prepared.fallbackPath;
      if (newPath) {
        savedPaths[key] = newPath;
        restoredByArchivePath.set(path, newPath);
      }
    }

    if (Array.isArray(copy.monitoringRecords)) {
      const restoredRecords = [];
      for (const [index, record] of copy.monitoringRecords.entries()) {
        const recordCopy = { ...record };
        const recordId = String(record.id ?? index + 1);

        for (const key of MONITORING_PHOTO_KEYS) {
          const path = record?.[key];
          if (typeof path !== "string" || !path) continue;

          const prepared = await preparePhoto(path);
          if (!prepared) continue;

          const keySuffix = key === "photo" ? "" : `_${key}`;
          const storageKey = `${baseKey}_monitoring_${recordId}${keySuffix}`;
          const newPath = await savePhoto(
            prepared.blob,
            storageKey,
            [...Object.values(savedPaths)],
            {
              cleanupOldVersions: false,
              contentHash: prepared.contentHash,
            },
          );
          if (!newPath && path.startsWith("zip:")) {
            throw appError(
              "PHOTO_SAVE_FAILED",
              `Не удалось сохранить фотографию ${path}`,
              { path },
            );
          }
          recordCopy[key] = newPath ?? prepared.fallbackPath;
          if (newPath) {
            savedPaths[`monitoring_${recordId}_${key}`] = newPath;
            restoredByArchivePath.set(path, newPath);
          }
        }
        restoredRecords.push(recordCopy);
      }
      copy.monitoringRecords = restoredRecords;
    }

    // Лента восстанавливается последней и переиспользует уже разложенные
    // снимки: один и тот же путь в архиве значит один и тот же файл на
    // устройстве, и второе сохранение развело бы осмотр и его событие по
    // разным копиям одной фотографии.
    if (Array.isArray(copy.events)) {
      const restoredEvents = [];
      for (const [index, event] of copy.events.entries()) {
        const eventCopy = { ...event };
        const eventId = String(event?.id ?? index + 1);

        for (const key of EVENT_PHOTO_KEYS) {
          const path = event?.[key];
          if (typeof path !== "string" || !path) continue;

          const known = restoredByArchivePath.get(path);
          if (known) {
            eventCopy[key] = known;
            continue;
          }

          const prepared = await preparePhoto(path);
          if (!prepared) continue;

          const keySuffix = key === "photo" ? "" : `_${key}`;
          const storageKey = `${baseKey}_event_${eventId}${keySuffix}`;
          const newPath = await savePhoto(
            prepared.blob,
            storageKey,
            [...Object.values(savedPaths)],
            {
              cleanupOldVersions: false,
              contentHash: prepared.contentHash,
            },
          );
          if (!newPath && path.startsWith("zip:")) {
            throw appError(
              "PHOTO_SAVE_FAILED",
              `Не удалось сохранить фотографию ${path}`,
              { path },
            );
          }
          eventCopy[key] = newPath ?? prepared.fallbackPath;
          if (newPath) {
            savedPaths[`event_${eventId}_${key}`] = newPath;
            restoredByArchivePath.set(path, newPath);
          }
        }
        restoredEvents.push(eventCopy);
      }
      copy.events = restoredEvents;
    }

    return copy;
  });
}
