import {
  EVENT_PHOTO_KEYS,
  MONITORING_PHOTO_KEYS,
  PHOTO_KEYS,
} from "./constants";
import {
  getChangedFieldKeys,
  getLeakIdentity,
  shouldApplyIncomingLeak,
} from "./leakMergeEngine";
import { getRecordMergeIdentity } from "./recordArrayMerge";

function isImportablePhoto(path) {
  return (
    typeof path === "string" &&
    (path.startsWith("zip:") || path.startsWith("data:image/"))
  );
}

/**
 * Снимки входящей утечки парами «что приезжает — что на этом месте сейчас».
 *
 * Обход идёт в том же порядке, что и `restorePhotos`: поля, записи обхода,
 * лента. Лента стоит последней не случайно — событие осмотра ссылается на тот
 * же файл, что и его запись обхода, и восстановление кладёт его на устройство
 * один раз. Поэтому и здесь уже встреченный путь второй раз не считается.
 * Без ленты архив, где снимки есть только у событий, выглядел в превью вовсе
 * без фото.
 */
function collectArchivePhotoPairs(current, incoming) {
  const pairs = [];
  const seen = new Set();
  const add = (incomingPhoto, existingPhoto) => {
    if (!isImportablePhoto(incomingPhoto) || seen.has(incomingPhoto)) return;
    seen.add(incomingPhoto);
    pairs.push({ incomingPhoto, existingPhoto });
  };

  for (const key of PHOTO_KEYS) {
    add(incoming?.[key], current?.[key]);
  }

  const currentMonitoring = current?.monitoringRecords ?? [];
  const currentById = new Map(
    currentMonitoring
      .filter((record) => record?.id != null)
      .map((record) => [String(record.id), record]),
  );
  for (const [index, record] of (incoming?.monitoringRecords ?? []).entries()) {
    const existingRecord =
      (record?.id != null ? currentById.get(String(record.id)) : null) ??
      currentMonitoring[index];
    for (const key of MONITORING_PHOTO_KEYS) {
      add(record?.[key], existingRecord?.[key]);
    }
  }

  // Событие опознаётся так же, как при самом слиянии, — по номеру, а у
  // событий из старых архивов по типу и моменту. По позиции нельзя: лента
  // сортируется по дате, и новое событие сдвигает все следующие.
  const currentEvents = new Map(
    (current?.events ?? []).map((event, index) => [
      getRecordMergeIdentity(event, index, "events"),
      event,
    ]),
  );
  for (const [index, event] of (incoming?.events ?? []).entries()) {
    const existingEvent = currentEvents.get(
      getRecordMergeIdentity(event, index, "events"),
    );
    for (const key of EVENT_PHOTO_KEYS) {
      add(event?.[key], existingEvent?.[key]);
    }
  }

  return pairs;
}

function getArchivePhotoMergeStats(photoPairs, applies) {
  const stats = { added: 0, replaced: 0, reused: 0 };
  for (const { existingPhoto } of photoPairs) {
    if (!applies) {
      if (existingPhoto) stats.reused += 1;
      continue;
    }
    if (existingPhoto) stats.replaced += 1;
    else stats.added += 1;
  }
  return stats;
}

export function previewMergeLeaks(existing = [], incoming = [], options = {}) {
  const existingByIdentity = new Map();
  const result = {
    added: 0,
    updated: 0,
    skipped: 0,
    archivePhotos: 0,
    changedFields: 0,
    changedFieldBreakdown: {},
    photoStats: { added: 0, replaced: 0, reused: 0 },
    total: incoming.length,
  };

  for (const leak of existing) {
    const identity = getLeakIdentity(leak, options);
    if (identity) existingByIdentity.set(identity, leak);
  }

  for (const leak of incoming) {
    const identity = getLeakIdentity(leak, options);
    const current = identity ? existingByIdentity.get(identity) : null;
    const changedFieldKeys = current
      ? getChangedFieldKeys(current, leak, options)
      : [];
    const applies =
      !current ||
      shouldApplyIncomingLeak(
        current,
        leak,
        options,
        changedFieldKeys.length > 0,
      );

    if (!current) result.added += 1;
    else if (applies) {
      result.updated += 1;
      result.changedFields += changedFieldKeys.length;
      for (const key of changedFieldKeys) {
        result.changedFieldBreakdown[key] =
          (result.changedFieldBreakdown[key] ?? 0) + 1;
      }
    } else result.skipped += 1;

    const photoPairs = collectArchivePhotoPairs(current, leak);
    if (applies) {
      result.archivePhotos += photoPairs.length;
    }
    const photoStats = getArchivePhotoMergeStats(photoPairs, applies);
    result.photoStats.added += photoStats.added;
    result.photoStats.replaced += photoStats.replaced;
    result.photoStats.reused += photoStats.reused;
  }

  return {
    ...result,
    photoStats: {
      ...result.photoStats,
      toSave: result.photoStats.added + result.photoStats.replaced,
      total:
        result.photoStats.added +
        result.photoStats.replaced +
        result.photoStats.reused,
    },
    changed: result.added + result.updated,
  };
}

export function filterIncomingLeaksForMerge(
  existing = [],
  incoming = [],
  options = {},
) {
  const existingByIdentity = new Map();

  for (const leak of existing) {
    const identity = getLeakIdentity(leak, options);
    if (identity) existingByIdentity.set(identity, leak);
  }

  return incoming.filter((leak) => {
    const identity = getLeakIdentity(leak, options);
    if (!identity) return true;

    const current = existingByIdentity.get(identity);
    if (!current) return true;

    return shouldApplyIncomingLeak(current, leak, options);
  });
}
