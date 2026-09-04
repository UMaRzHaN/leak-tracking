import {
  buildEventPhotoArchivePath,
  buildLeakPhotoArchivePath,
  buildMonitoringPhotoArchivePath,
} from "@/services/archive/archivePaths";
import { resolvePhotoCandidates } from "./photoResolution";
import { getMonitoringRecords } from "@/utils/monitoring";
import {
  EVENT_PHOTO_FIELDS,
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";
import { getLeakEvents } from "@/domain/leakEvents";
import { fromEntries } from "@/utils/fromEntries";
import {
  getEventPhotoIdentity,
  getEventPhotoMapKey,
  getLeakPhotoIdentity,
  getLeakPhotoPath,
  getMonitoringPhotoIdentity,
  getMonitoringPhotoMapKey,
} from "./photoIdentity";

export const PHOTO_KEYS = LEAK_PHOTO_FIELDS;

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
/**
 * Снимки ленты подряд: утечка, событие, поле.
 *
 * Обход один на двоих — на сборщик файлов и на сборщик ссылок. Разойдись они
 * хоть на шаг, и снимок, который один счёл дублем, другой не нашёл бы вовсе.
 */
function* iterateEventPhotos(orderedLeaks) {
  for (const [leakIndex, leak] of orderedLeaks.entries()) {
    for (const [eventIndex, event] of getLeakEvents(leak).entries()) {
      for (const photoKey of EVENT_PHOTO_FIELDS) {
        const path = event?.[photoKey];
        if (!path) continue;
        yield { leakIndex, leak, eventIndex, event, photoKey, path };
      }
    }
  }
}

/**
 * Ключи снимков ленты, которым файл в книге уже завели.
 *
 * Такой снимок — тот же самый файл, что у колонки или у обхода, и второй
 * копии ему не нужно. Но ключ листу ремонтов нужен: без него лист говорит
 * «есть, файл не найден» про снимок, который в архиве лежит — просто под
 * именем колонки. Путь подставляется позже: до подстановки путей архива он
 * ещё не известен.
 *
 * @param {any[]} orderedLeaks
 * @param {Set<string>} takenSourcePaths
 */
export function collectEventPhotoAliases(
  orderedLeaks,
  takenSourcePaths = /** @type {Set<string>} */ (new Set()),
) {
  const aliases = [];
  const seen = new Set(takenSourcePaths);

  for (const { leakIndex, eventIndex, photoKey, path } of iterateEventPhotos(
    orderedLeaks,
  )) {
    if (seen.has(String(path))) {
      aliases.push({
        mapKey: getEventPhotoMapKey(leakIndex, eventIndex, photoKey),
        sourcePath: String(path),
      });
      continue;
    }
    seen.add(String(path));
  }

  return aliases;
}

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

  for (const {
    leakIndex,
    leak,
    eventIndex,
    event,
    photoKey,
    path,
  } of iterateEventPhotos(orderedLeaks)) {
    if (seen.has(String(path))) continue;
    seen.add(String(path));
    const leakSegment = leakSegments[leakIndex];

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

  return resolvePhotoCandidates(candidates, idbGet, photoReadCache);
}

export function buildPhotoMap(photoEntries) {
  return fromEntries(
    photoEntries.map((entry) => [entry.mapKey, entry.photoFileName]),
  );
}
