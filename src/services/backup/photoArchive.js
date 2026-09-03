import { appError } from "@/utils/appError";
import { getPhotoBlob, getPhotoSrc } from "@/hooks/photoService";
import { fingerprintBlob } from "@/utils/blobHash";
import { blobToDataUri, dataUrlToBlob } from "@/utils/photoConversion";
import { isArchivePhotoPath } from "@/services/backup/archivePhotoReader";
import {
  allocateUniqueLeakArchiveSegments,
  buildEventPhotoArchivePath,
  buildLeakPhotoArchivePath,
  buildMonitoringPhotoArchivePath,
  normalizeImageExtension,
  parseDataImageUri,
} from "@/services/archive/archivePaths";
import {
  EVENT_PHOTO_KEYS,
  EXPORT_CONCURRENCY,
  EXPORT_YIELD_EVERY,
  IMPORT_CONCURRENCY,
  MONITORING_PHOTO_KEYS,
  PHOTO_KEYS,
} from "./constants";
import { mapWithConcurrency, yieldToMainThread } from "./runtime";

async function resolveBase64(path, idbGet) {
  if (typeof path !== "string" || !path) return null;

  let src = /** @type {string|null} */ (null);
  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    const raw = idbGet ? await idbGet(id) : null;
    // raw can be a Blob (new storage) or a data URI string (legacy storage)
    if (!raw) return null;
    src = raw instanceof Blob ? await blobToDataUri(raw) : raw;
  } else if (path.startsWith("data:image/")) {
    src = path;
  } else {
    src = await getPhotoSrc(path);
  }

  if (!src || !src.startsWith("data:")) return null;
  return parseDataImageUri(src);
}

export async function resolvePhotoBlob(path, idbGet) {
  if (typeof path !== "string" || !path) return null;

  let value = /** @type {Blob|string|null} */ (null);
  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    value = idbGet ? await idbGet(id) : null;
  } else if (path.startsWith("data:image/")) {
    value = path;
  } else {
    // Здесь нужны байты, а не строка для <img>: на устройстве это читается
    // напрямую, минуя base64 и мост. Каждое фото проекта проходит через эту
    // строку, когда собирается архив — и для выгрузки, и для переноса по QR.
    value = (await getPhotoBlob(path)) ?? (await getPhotoSrc(path));
  }
  if (!value) return null;

  const blob = value instanceof Blob ? value : dataUrlToBlob(value);
  if (!blob) return null;
  const mime = blob.type || String(value).match(/^data:([^;]+);base64,/)?.[1];
  if (!mime?.startsWith("image/")) return null;
  return { blob, ext: normalizeImageExtension(mime) };
}

/**
 * Снимки ленты событий в архив.
 *
 * Почти каждый из них уже там: осмотр — это запись обхода, последняя починка —
 * поле самой утечки. Поэтому сначала спрашивается, куда этот путь уже положили,
 * и только не найденное пишется заново. Иначе архив с двумя обходами и двумя
 * ремонтами раздувался бы вдвое — на телефоне это десятки мегабайт.
 *
 * @param {any[]} events
 * @param {string} leakNumber
 * @param {Map<string, string>} archived путь на устройстве → путь в архиве
 * @param {(path: string) => Promise<{ext: string, write: (archivePath: string) => void|Promise<void>}|null>} store
 * @param {boolean} preserveUnresolvedPhotoPaths
 */
async function exportEventPhotos(
  events,
  leakNumber,
  archived,
  store,
  preserveUnresolvedPhotoPaths,
) {
  const exported = [];
  for (const [eventIndex, event] of events.entries()) {
    const copy = { ...event };
    for (const key of EVENT_PHOTO_KEYS) {
      const path = event?.[key];
      if (path == null) continue;

      const known = archived.get(String(path));
      if (known) {
        copy[key] = known;
        continue;
      }

      const resolved = await store(String(path));
      if (!resolved) {
        if (!preserveUnresolvedPhotoPaths) delete copy[key];
        continue;
      }
      const archivePath = buildEventPhotoArchivePath(
        leakNumber,
        eventIndex,
        resolved.ext,
        key,
      );
      await resolved.write(archivePath);
      archived.set(String(path), `zip:${archivePath}`);
      copy[key] = `zip:${archivePath}`;
    }
    exported.push(copy);
  }
  return exported;
}

export async function exportLeaksWithPhotosToStream(
  leaks,
  zip,
  idbGet,
  {
    segmentPrefix = "leak",
    preserveUnresolvedPhotoPaths = false,
    leakSegments: providedLeakSegments = /** @type {string[]|null} */ (null),
  } = {},
) {
  const exported = new Array(leaks.length);
  const leakSegments =
    providedLeakSegments ??
    allocateUniqueLeakArchiveSegments(leaks, { prefix: segmentPrefix });

  for (const [index, leak] of leaks.entries()) {
    if (index > 0 && index % EXPORT_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }
    if (!leak || typeof leak !== "object" || Array.isArray(leak)) {
      exported[index] = leak;
      continue;
    }
    const copy = { ...leak };
    const leakNumber = leakSegments[index];

    const archived = new Map();

    for (const key of PHOTO_KEYS) {
      const path = leak[key];
      if (path == null) continue;
      const resolved = await resolvePhotoBlob(path, idbGet);
      if (!resolved) {
        if (!preserveUnresolvedPhotoPaths) delete copy[key];
        continue;
      }

      const archivePath = buildLeakPhotoArchivePath(
        leakNumber,
        key,
        resolved.ext,
      );
      await zip.add(archivePath, resolved.blob);
      copy[key] = `zip:${archivePath}`;
      archived.set(String(path), `zip:${archivePath}`);
    }

    if (Array.isArray(copy.monitoringRecords)) {
      const records = [];
      for (const [recordIndex, record] of copy.monitoringRecords.entries()) {
        const recordCopy = { ...record };
        for (const key of MONITORING_PHOTO_KEYS) {
          const path = record?.[key];
          if (path == null) continue;
          const resolved = await resolvePhotoBlob(path, idbGet);
          if (!resolved) {
            if (!preserveUnresolvedPhotoPaths) delete recordCopy[key];
            continue;
          }
          const archivePath = buildMonitoringPhotoArchivePath(
            leakNumber,
            recordIndex,
            resolved.ext,
            key,
          );
          await zip.add(archivePath, resolved.blob);
          recordCopy[key] = `zip:${archivePath}`;
          archived.set(String(path), `zip:${archivePath}`);
        }
        records.push(recordCopy);
      }
      copy.monitoringRecords = records;
    }

    if (Array.isArray(copy.events)) {
      copy.events = await exportEventPhotos(
        copy.events,
        leakNumber,
        archived,
        async (path) => {
          const resolved = await resolvePhotoBlob(path, idbGet);
          if (!resolved) return null;
          return {
            ext: resolved.ext,
            write: (archivePath) => zip.add(archivePath, resolved.blob),
          };
        },
        preserveUnresolvedPhotoPaths,
      );
    }

    exported[index] = copy;
  }

  return exported;
}
export async function exportLeaksWithPhotos(
  leaks,
  zip,
  idbGet,
  {
    segmentPrefix = "leak",
    preserveUnresolvedPhotoPaths = false,
    leakSegments: providedLeakSegments = /** @type {string[]|null} */ (null),
  } = {},
) {
  const exported = new Array(leaks.length);
  const leakSegments =
    providedLeakSegments ??
    allocateUniqueLeakArchiveSegments(leaks, { prefix: segmentPrefix });
  let cursor = 0;

  async function exportOne(leak, index) {
    if (!leak || typeof leak !== "object" || Array.isArray(leak)) {
      exported[index] = leak;
      return;
    }
    const copy = { ...leak };
    const leakNumber = leakSegments[index];

    const archived = new Map();

    for (const key of PHOTO_KEYS) {
      const path = leak[key];
      if (path == null) continue;
      const resolved = await resolveBase64(path, idbGet);
      if (!resolved) {
        if (!preserveUnresolvedPhotoPaths) delete copy[key];
        continue;
      }

      const archivePath = buildLeakPhotoArchivePath(
        leakNumber,
        key,
        resolved.ext,
      );
      zip.file(archivePath, resolved.base64, { base64: true });
      copy[key] = `zip:${archivePath}`;
      archived.set(String(path), `zip:${archivePath}`);
    }

    if (Array.isArray(copy.monitoringRecords)) {
      const records = [];
      for (const [recordIndex, record] of copy.monitoringRecords.entries()) {
        const recordCopy = { ...record };
        for (const key of MONITORING_PHOTO_KEYS) {
          const path = record?.[key];
          if (path == null) continue;

          const resolved = await resolveBase64(path, idbGet);
          if (!resolved) {
            if (!preserveUnresolvedPhotoPaths) delete recordCopy[key];
            continue;
          }

          const archivePath = buildMonitoringPhotoArchivePath(
            leakNumber,
            recordIndex,
            resolved.ext,
            key,
          );
          zip.file(archivePath, resolved.base64, { base64: true });
          recordCopy[key] = `zip:${archivePath}`;
          archived.set(String(path), `zip:${archivePath}`);
        }
        records.push(recordCopy);
      }
      copy.monitoringRecords = records;
    }

    if (Array.isArray(copy.events)) {
      copy.events = await exportEventPhotos(
        copy.events,
        leakNumber,
        archived,
        async (path) => {
          const resolved = await resolveBase64(path, idbGet);
          if (!resolved) return null;
          return {
            ext: resolved.ext,
            write: (archivePath) =>
              zip.file(archivePath, resolved.base64, { base64: true }),
          };
        },
        preserveUnresolvedPhotoPaths,
      );
    }

    exported[index] = copy;
  }

  async function worker() {
    while (cursor < leaks.length) {
      const index = cursor;
      cursor += 1;
      if (index > 0 && index % EXPORT_YIELD_EVERY === 0) {
        await yieldToMainThread();
      }
      await exportOne(leaks[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(EXPORT_CONCURRENCY, leaks.length) }, worker),
  );

  return exported;
}

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
