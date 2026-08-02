import { MONITORING_PHOTO_KEYS, PHOTO_KEYS } from "./constants";
import {
  getChangedFieldKeys,
  getLeakIdentity,
  shouldApplyIncomingLeak,
} from "./leakMergeEngine";

function hasImportablePhoto(leak, key) {
  const path = leak?.[key];
  return (
    typeof path === "string" &&
    (path.startsWith("zip:") || path.startsWith("data:image/"))
  );
}

function countImportableArchivePhotos(leak) {
  const mainPhotos = PHOTO_KEYS.filter((key) =>
    hasImportablePhoto(leak, key),
  ).length;
  const monitoringPhotos = Array.isArray(leak?.monitoringRecords)
    ? leak.monitoringRecords.reduce(
        (count, record) =>
          count +
          MONITORING_PHOTO_KEYS.filter((key) => hasImportablePhoto(record, key))
            .length,
        0,
      )
    : 0;

  return mainPhotos + monitoringPhotos;
}

function getArchivePhotoMergeStats(current, incoming, applies) {
  const stats = { added: 0, replaced: 0, reused: 0 };
  const classify = (incomingPhoto, existingPhoto) => {
    if (
      typeof incomingPhoto !== "string" ||
      (!incomingPhoto.startsWith("zip:") &&
        !incomingPhoto.startsWith("data:image/"))
    ) {
      return;
    }
    if (!applies) {
      if (existingPhoto) stats.reused += 1;
      return;
    }
    if (existingPhoto) stats.replaced += 1;
    else stats.added += 1;
  };

  for (const key of PHOTO_KEYS) {
    classify(incoming?.[key], current?.[key]);
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
      classify(record?.[key], existingRecord?.[key]);
    }
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

    if (applies) {
      result.archivePhotos += countImportableArchivePhotos(leak);
    }
    const photoStats = getArchivePhotoMergeStats(current, leak, applies);
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
