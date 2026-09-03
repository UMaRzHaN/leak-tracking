import {
  buildEventPhotoArchivePath,
  buildLeakPhotoArchivePath,
  buildMonitoringPhotoArchivePath,
  parseDataImageUri,
} from "@/services/archive/archivePaths";
import { getPhotoSrc } from "@/hooks/photoService";
import { blobToDataUri } from "@/utils/photoConversion";
import { getMonitoringRecords } from "@/utils/monitoring";
import {
  EVENT_PHOTO_FIELDS,
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";
import {
  getLeakEvents,
  getRepairDonePhoto,
  getRepairPhoto,
} from "@/domain/leakEvents";
import { fromEntries } from "@/utils/fromEntries";

export const PHOTO_KEYS = LEAK_PHOTO_FIELDS;

const EXPORT_YIELD_EVERY = 40;
const PHOTO_READ_CONCURRENCY = 4;

/** @returns {Promise<void>} */
function yieldToMainThread() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function resolvePhotoSrc(path, idbGet) {
  if (!path) return null;

  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    const raw = idbGet ? await idbGet(id) : null;
    if (!raw) return null;
    return raw instanceof Blob ? blobToDataUri(raw) : raw;
  }

  return getPhotoSrc(path);
}

async function resolvePhotoCandidates(candidates, idbGet, photoReadCache) {
  if (candidates.length === 0) return [];

  const entries = new Array(candidates.length);
  let nextIndex = 0;
  let completed = 0;

  async function runWorker() {
    while (nextIndex < candidates.length) {
      const candidateIndex = nextIndex;
      nextIndex += 1;
      const candidate = candidates[candidateIndex];
      let sourcePromise = photoReadCache.get(candidate.path);
      if (!sourcePromise) {
        sourcePromise = resolvePhotoSrc(candidate.path, idbGet);
        photoReadCache.set(candidate.path, sourcePromise);
      }
      const src = await sourcePromise;

      if (src?.startsWith("data:")) {
        const parsed = parseDataImageUri(src);
        if (parsed) {
          entries[candidateIndex] = {
            mapKey: candidate.mapKey,
            logicalKey: candidate.logicalKey,
            sourcePath: candidate.path,
            photoFileName: candidate.buildArchivePath(parsed.ext),
            base64: parsed.base64,
          };
        }
      }

      completed += 1;
      if (completed % EXPORT_YIELD_EVERY === 0) {
        await yieldToMainThread();
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(PHOTO_READ_CONCURRENCY, candidates.length) },
      () => runWorker(),
    ),
  );
  return entries.filter(Boolean);
}

function getLeakPhotoIdentity(leak, leakIndex, photoKey) {
  const leakIdentity =
    leak?.id != null && String(leak.id).trim()
      ? `id:${String(leak.id)}`
      : `tag:${String(leak?.leak_id ?? "").trim() || `index:${leakIndex}`}`;
  return `${leakIdentity}:field:${photoKey}`;
}

function getMonitoringPhotoIdentity(
  leak,
  leakIndex,
  record,
  recordIndex,
  photoKey,
) {
  const leakIdentity =
    leak?.id != null && String(leak.id).trim()
      ? `id:${String(leak.id)}`
      : `tag:${String(leak?.leak_id ?? "").trim() || `index:${leakIndex}`}`;
  const recordIdentity =
    record?.id != null && String(record.id).trim()
      ? `id:${String(record.id)}`
      : `index:${recordIndex}`;
  const baseIdentity = `${leakIdentity}:monitoring:${recordIdentity}`;
  return photoKey === "photo"
    ? baseIdentity
    : `${baseIdentity}:field:${photoKey}`;
}

function getMonitoringPhotoMapKey(leakIndex, recordIndex, photoKey) {
  const baseKey = `monitoring:${leakIndex}:${recordIndex}`;
  return photoKey === "photo" ? baseKey : `${baseKey}:${photoKey}`;
}

export function getEventPhotoMapKey(leakIndex, eventIndex, photoKey) {
  const baseKey = `event:${leakIndex}:${eventIndex}`;
  return photoKey === "photo" ? baseKey : `${baseKey}:${photoKey}`;
}

function getEventPhotoIdentity(leak, leakIndex, event, eventIndex, photoKey) {
  const leakIdentity =
    leak?.id != null && String(leak.id).trim()
      ? `id:${String(leak.id)}`
      : `tag:${String(leak?.leak_id ?? "").trim() || `index:${leakIndex}`}`;
  const eventIdentity =
    event?.id != null && String(event.id).trim()
      ? `id:${String(event.id)}`
      : `index:${eventIndex}`;
  const baseIdentity = `${leakIdentity}:event:${eventIdentity}`;
  return photoKey === "photo"
    ? baseIdentity
    : `${baseIdentity}:field:${photoKey}`;
}

/**
 * Путь снимка утечки для колонки книги.
 *
 * Поля `photo_repair` и `photo_after` перестали писаться: починка живёт в
 * ленте. Колонки «Фото в ремонте» и «Фото после ремонта» остаются, и путь для
 * них спрашивается там же, где его теперь спрашивает карточка, — иначе книга
 * обещала бы снимок и отправляла к файлу, которого в ней нет.
 */
function getLeakPhotoPath(leak, key) {
  if (key === "photo_repair") return getRepairPhoto(leak);
  if (key === "photo_after") return getRepairDonePhoto(leak);
  return leak?.[key] ?? null;
}

export async function buildLeakPhotoEntries(
  orderedLeaks,
  leakSegments,
  idbGet,
  photoReadCache,
  archiveRoot = "photos",
) {
  const candidates = [];

  for (const [leakIndex, leak] of orderedLeaks.entries()) {
    for (const key of PHOTO_KEYS) {
      const path = getLeakPhotoPath(leak, key);
      if (!path) continue;

      const leakSegment = leakSegments[leakIndex];
      candidates.push({
        path,
        mapKey: `${leakIndex}:${key}`,
        logicalKey: getLeakPhotoIdentity(leak, leakIndex, key),
        buildArchivePath: (extension) => {
          const backupPath = buildLeakPhotoArchivePath(
            leakSegment,
            key,
            extension,
          );
          return archiveRoot === "photos"
            ? backupPath
            : `${archiveRoot}/${backupPath.slice("photos/".length)}`;
        },
      });
    }
  }

  return resolvePhotoCandidates(candidates, idbGet, photoReadCache);
}

export async function buildMonitoringPhotoEntries(
  orderedLeaks,
  leakSegments,
  idbGet,
  includedPhotoKeys = /** @type {Set<string>|null} */ (null),
  photoReadCache,
  archiveRoot = "photos",
) {
  const candidates = [];

  for (const [leakIndex, leak] of orderedLeaks.entries()) {
    const leakSegment = leakSegments[leakIndex];
    const records = getMonitoringRecords(leak);

    for (const [recordIndex, record] of records.entries()) {
      const baseMapKey = getMonitoringPhotoMapKey(
        leakIndex,
        recordIndex,
        "photo",
      );
      for (const photoKey of MONITORING_PHOTO_FIELDS) {
        const mapKey = getMonitoringPhotoMapKey(
          leakIndex,
          recordIndex,
          photoKey,
        );
        if (
          includedPhotoKeys &&
          !includedPhotoKeys.has(baseMapKey) &&
          !includedPhotoKeys.has(mapKey)
        ) {
          continue;
        }
        if (!record?.[photoKey]) continue;

        candidates.push({
          path: record[photoKey],
          mapKey,
          logicalKey: getMonitoringPhotoIdentity(
            leak,
            leakIndex,
            record,
            recordIndex,
            photoKey,
          ),
          buildArchivePath: (extension) => {
            const backupPath = buildMonitoringPhotoArchivePath(
              leakSegment,
              recordIndex,
              extension,
              photoKey,
            );
            return archiveRoot === "photos"
              ? backupPath
              : `${archiveRoot}/${backupPath.slice("photos/".length)}`;
          },
        });
      }
    }
  }

  return resolvePhotoCandidates(candidates, idbGet, photoReadCache);
}

/**
 * Снимки ленты, которых нет больше нигде.
 *
 * Почти каждый снимок события уже выгружен своим владельцем: осмотр — записью
 * обхода, последняя починка — полем самой утечки. Второй раз класть его в книгу
 * незачем, поэтому берутся только пути, не встреченные прежними сборщиками, —
 * а это ровно фото прежних починок, которые после следующего ремонта не
 * остаются ни в полях, ни в обходах.
 *
 * @param {string[]} orderedLeaks
 * @param {any} leakSegments
 * @param {any} idbGet
 * @param {Set<string>} takenSourcePaths пути, уже попавшие в книгу
 * @param {any} photoReadCache
 * @param {string} archiveRoot
 */
export async function buildEventPhotoEntries(
  orderedLeaks,
  leakSegments,
  idbGet,
  takenSourcePaths = /** @type {Set<string>} */ (new Set()),
  photoReadCache,
  archiveRoot = "photos",
) {
  const candidates = [];
  const seen = new Set(takenSourcePaths);

  for (const [leakIndex, leak] of orderedLeaks.entries()) {
    const leakSegment = leakSegments[leakIndex];

    for (const [eventIndex, event] of getLeakEvents(leak).entries()) {
      for (const photoKey of EVENT_PHOTO_FIELDS) {
        const path = event?.[photoKey];
        if (!path || seen.has(String(path))) continue;
        seen.add(String(path));

        candidates.push({
          path,
          mapKey: getEventPhotoMapKey(leakIndex, eventIndex, photoKey),
          logicalKey: getEventPhotoIdentity(
            leak,
            leakIndex,
            event,
            eventIndex,
            photoKey,
          ),
          buildArchivePath: (extension) => {
            const backupPath = buildEventPhotoArchivePath(
              leakSegment,
              eventIndex,
              extension,
              photoKey,
            );
            return archiveRoot === "photos"
              ? backupPath
              : `${archiveRoot}/${backupPath.slice("photos/".length)}`;
          },
        });
      }
    }
  }

  return resolvePhotoCandidates(candidates, idbGet, photoReadCache);
}

export function buildPhotoMap(photoEntries) {
  return fromEntries(
    photoEntries.map((entry) => [entry.mapKey, entry.photoFileName]),
  );
}

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
