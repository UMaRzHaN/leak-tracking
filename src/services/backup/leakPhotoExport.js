import {
  buildEventPhotoArchivePath,
  buildLeakPhotoArchivePath,
  buildMonitoringPhotoArchivePath,
  buildRoundMonitoringPhotoArchivePath,
} from "@/services/archive/archivePaths";
import {
  EVENT_PHOTO_KEYS,
  MONITORING_PHOTO_KEYS,
  PHOTO_KEYS,
} from "./constants";
import { getMonitoringRecords } from "@/utils/monitoring";

/**
 * Раскладка снимков одной утечки по архиву.
 *
 * Обе выгрузки — потоковая на телефоне и через JSZip в браузере — кладут
 * снимки в одни и те же места и отличаются только тем, как пишется файл.
 * Это «как» приходит сюда функцией `store`: путь на устройстве → расширение и
 * запись по пути в архиве, или null, если снимок не прочитался. Раньше обе
 * выгрузки держали эту раскладку у себя, строка в строку, и правка одной
 * молча расходилась с другой.
 *
 * @typedef {(path: string) => Promise<{ext: string, write: (archivePath: string) => void|Promise<void>}|null>} PhotoStore
 */

/**
 * Снимки осмотров — первыми, в папки обходов. У открытой утечки «фото до» —
 * это и есть снимок последнего осмотра; пойди поля утечки первыми, он лёг бы в
 * её папку, и обход остался бы без своего снимка. Дальше такие пути берутся
 * из `archived`, второй копии не появляется.
 */
async function archiveInspectionPhotos(leak, placeRecord, archived, store) {
  for (const record of getMonitoringRecords(leak)) {
    for (const key of MONITORING_PHOTO_KEYS) {
      const path = record?.[key];
      if (path == null || archived.has(String(path))) continue;
      const resolved = await store(String(path));
      if (!resolved) continue;
      const archivePath = inspectionPhotoPath(
        placeRecord,
        record,
        resolved.ext,
        key,
      );
      if (!archivePath) continue;
      await resolved.write(archivePath);
      archived.set(String(path), `zip:${archivePath}`);
    }
  }
}

/**
 * Снимок осмотра — в папку своего обхода, если раскладка по обходам задана;
 * иначе по-старому, в папку утечки. Без раскладки выгружаются записи
 * восстановления: обходов у них в бэкапе не считают.
 */
function inspectionPhotoPath(placeRecord, record, extension, key) {
  const placement = placeRecord?.(record);
  return placement
    ? buildRoundMonitoringPhotoArchivePath(
        placement.roundSegment,
        placement.leakSegment,
        placement.recordNumber,
        extension,
        key,
      )
    : null;
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
 * @param {((record: any) => any)|null} [placeRecord]
 */
async function exportEventPhotos(
  events,
  leakNumber,
  archived,
  store,
  preserveUnresolvedPhotoPaths,
  placeRecord = null,
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
      const archivePath =
        inspectionPhotoPath(placeRecord, event, resolved.ext, key) ??
        buildEventPhotoArchivePath(leakNumber, eventIndex, resolved.ext, key);
      await resolved.write(archivePath);
      archived.set(String(path), `zip:${archivePath}`);
      copy[key] = `zip:${archivePath}`;
    }
    exported.push(copy);
  }
  return exported;
}

/**
 * Один снимок: уже лежащий в архиве — ссылкой на него, иначе — записью по
 * пути, который назначит `archivePathFor`. Не прочитавшийся снимок либо
 * остаётся прежним путём, либо уходит из записи.
 */
async function archivePhoto(copy, key, path, archived, store, options) {
  const known = archived.get(String(path));
  if (known) {
    copy[key] = known;
    return;
  }
  // Сам путь, а не его строка: путь не строкой не читается ни одним
  // хранилищем, и так было до выноса сюда.
  const resolved = await store(path);
  if (!resolved) {
    if (!options.preserveUnresolvedPhotoPaths) delete copy[key];
    return;
  }
  const archivePath = options.archivePathFor(resolved.ext);
  await resolved.write(archivePath);
  copy[key] = `zip:${archivePath}`;
  archived.set(String(path), `zip:${archivePath}`);
}

/**
 * Копия утечки, снимки которой лежат в архиве, а пути ведут на них.
 *
 * @param {any} leak
 * @param {string} leakNumber папка утечки в архиве
 * @param {PhotoStore} store
 * @param {{placeRecord: ((record: any) => any)|null, preserveUnresolvedPhotoPaths: boolean}} options
 */
export async function exportLeakPhotos(leak, leakNumber, store, options) {
  const { placeRecord, preserveUnresolvedPhotoPaths } = options;
  const copy = { ...leak };
  const archived = new Map();
  if (placeRecord) {
    await archiveInspectionPhotos(leak, placeRecord, archived, store);
  }

  for (const key of PHOTO_KEYS) {
    const path = leak[key];
    if (path == null) continue;
    await archivePhoto(copy, key, path, archived, store, {
      preserveUnresolvedPhotoPaths,
      archivePathFor: (ext) => buildLeakPhotoArchivePath(leakNumber, key, ext),
    });
  }

  if (Array.isArray(copy.monitoringRecords)) {
    const records = [];
    for (const [recordIndex, record] of copy.monitoringRecords.entries()) {
      const recordCopy = { ...record };
      for (const key of MONITORING_PHOTO_KEYS) {
        const path = record?.[key];
        if (path == null) continue;
        await archivePhoto(recordCopy, key, path, archived, store, {
          preserveUnresolvedPhotoPaths,
          archivePathFor: (ext) =>
            inspectionPhotoPath(placeRecord, record, ext, key) ??
            buildMonitoringPhotoArchivePath(leakNumber, recordIndex, ext, key),
        });
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
      store,
      preserveUnresolvedPhotoPaths,
      placeRecord,
    );
  }
  return copy;
}
