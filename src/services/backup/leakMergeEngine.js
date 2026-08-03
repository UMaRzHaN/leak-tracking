import {
  LEAK_FIELD_VERSIONS_KEY,
  getLeakFieldVersion,
  isVersionedLeakField,
  normalizeLeakFieldVersions,
} from "@/services/leakFieldVersions";
import { getLeakMergeIdentity } from "@/services/sync/projectSyncState";
import { PHOTO_KEYS } from "./constants";
import {
  buildMergeHistoryChanges,
  EXCEL_DERIVED_FIELD_KEYS,
  isEmptyMergeValue,
  MERGE_ARRAY_FIELD_KEYS,
  MERGE_IGNORED_FIELD_KEYS,
  mergeFieldValuesEqual,
} from "./mergeValues";
import { hasOwn, mergeRecordArray } from "./recordArrayMerge";
import { parseTime } from "./projectMeta";
import { normalizeLeakTag } from "@/utils/leakIdentity";

export function getLeakIdentity(leak, options = {}) {
  if (options.source !== "sync") {
    const leakTag = normalizeLeakTag(leak?.leak_id);
    if (leakTag) return `tag:${leakTag}`;
  }
  return getLeakMergeIdentity(leak);
}

function getLeakFreshness(leak) {
  const historyTimes = Array.isArray(leak?.history)
    ? leak.history.map((entry) => parseTime(entry?.date))
    : [];
  const monitoringTimes = Array.isArray(leak?.monitoringRecords)
    ? leak.monitoringRecords.map((entry) => parseTime(entry?.date))
    : [];
  return Math.max(
    parseTime(leak?.updatedAt),
    parseTime(leak?.createdAt),
    parseTime(leak?.resolvedAt),
    ...historyTimes,
    ...monitoringTimes,
  );
}

const SYNC_CONFLICT_IGNORED_KEYS = new Set([
  "id",
  "index",
  "photo",
  "photo_after",
  "photo_repair",
]);

function normalizeSyncConflictValue(value) {
  if (Array.isArray(value)) {
    return value
      .map(normalizeSyncConflictValue)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => !SYNC_CONFLICT_IGNORED_KEYS.has(key))
        .sort()
        .map((key) => [key, normalizeSyncConflictValue(value[key])]),
    );
  }
  return value;
}

function getSyncConflictKey(leak) {
  return JSON.stringify(normalizeSyncConflictValue(leak));
}

export function shouldApplyIncomingLeak(
  current,
  incoming,
  options = {},
  hasChanges = true,
) {
  if (options.source === "excel" || options.source === "sync") {
    return hasChanges;
  }
  if (options.source === "archive") {
    // Field-version metadata makes archive merge safe at field granularity.
    // Legacy archives have only a leak-level timestamp, so an older snapshot
    // must not overwrite newer local values or trigger unnecessary photo restore.
    if (hasFieldVersionMetadata(current) || hasFieldVersionMetadata(incoming)) {
      return hasChanges;
    }
  }
  const currentFreshness = getLeakFreshness(current);
  const incomingFreshness = getLeakFreshness(incoming);
  if (incomingFreshness !== currentFreshness) {
    return incomingFreshness > currentFreshness;
  }

  const currentKey = getSyncConflictKey(current);
  const incomingKey = getSyncConflictKey(incoming);
  return incomingKey !== currentKey && incomingKey > currentKey;
}

function stableSyncValue(hasValue, value) {
  if (!hasValue) return "0:deleted";
  if (value === undefined) return "1:undefined";
  return `2:${JSON.stringify(normalizeSyncConflictValue(value))}`;
}

function isRestoredPhotoPath(path) {
  return (
    typeof path === "string" && path.trim() !== "" && !path.startsWith("zip:")
  );
}

function mergePhotoFields(existingLeak, incomingLeak) {
  const next = { ...incomingLeak };

  for (const key of PHOTO_KEYS) {
    if (
      !isRestoredPhotoPath(next[key]) &&
      isRestoredPhotoPath(existingLeak?.[key])
    ) {
      next[key] = existingLeak[key];
    }
  }

  return next;
}

function mergeVersionedLeakFields(existingLeak, incomingLeak, options = {}) {
  const next = { ...existingLeak };
  const existingVersions = normalizeLeakFieldVersions(
    existingLeak?.[LEAK_FIELD_VERSIONS_KEY],
  );
  const incomingVersions = normalizeLeakFieldVersions(
    incomingLeak?.[LEAK_FIELD_VERSIONS_KEY],
  );
  const mergedVersions = { ...existingVersions };
  const keys = new Set([
    ...Object.keys(existingLeak ?? {}),
    ...Object.keys(incomingLeak ?? {}),
    ...Object.keys(existingVersions),
    ...Object.keys(incomingVersions),
  ]);

  for (const key of keys) {
    if (!isVersionedLeakField(key)) continue;

    const incomingHasValue = hasOwn(incomingLeak ?? {}, key);
    const incomingHasVersion = hasOwn(incomingVersions, key);
    if (!incomingHasValue && !incomingHasVersion) continue;

    const existingHasValue = hasOwn(existingLeak ?? {}, key);
    const existingVersion = getLeakFieldVersion(existingLeak, key);
    const incomingVersion = getLeakFieldVersion(incomingLeak, key);
    const incomingWins =
      incomingVersion > existingVersion ||
      (incomingVersion === existingVersion &&
        stableSyncValue(incomingHasValue, incomingLeak?.[key]) >
          stableSyncValue(existingHasValue, existingLeak?.[key]));

    mergedVersions[key] = Math.max(existingVersion, incomingVersion);
    if (!incomingWins) continue;

    if (incomingHasValue) next[key] = incomingLeak[key];
    else delete next[key];
  }

  for (const key of MERGE_ARRAY_FIELD_KEYS) {
    if (!hasOwn(existingLeak ?? {}, key) && !hasOwn(incomingLeak ?? {}, key)) {
      continue;
    }
    next[key] = mergeRecordArray(
      Array.isArray(existingLeak?.[key]) ? existingLeak[key] : [],
      Array.isArray(incomingLeak?.[key]) ? incomingLeak[key] : [],
      key,
      options,
    );
  }

  next.id = existingLeak?.id ?? incomingLeak?.id;
  next.index = existingLeak?.index ?? incomingLeak?.index;
  next.updatedAt = Math.max(
    parseTime(existingLeak?.updatedAt),
    parseTime(incomingLeak?.updatedAt),
  );
  next[LEAK_FIELD_VERSIONS_KEY] = mergedVersions;
  return next;
}

function mergeMixedFormatLeak(existingLeak, incomingLeak, options = {}) {
  const existingVersioned = hasFieldVersionMetadata(existingLeak);
  const versioned = existingVersioned ? existingLeak : incomingLeak;
  const legacy = existingVersioned ? incomingLeak : existingLeak;
  const versions = normalizeLeakFieldVersions(
    versioned?.[LEAK_FIELD_VERSIONS_KEY],
  );
  const next = { ...versioned };

  for (const [key, value] of Object.entries(legacy ?? {})) {
    if (MERGE_IGNORED_FIELD_KEYS.has(key) || MERGE_ARRAY_FIELD_KEYS.has(key))
      continue;
    if (hasOwn(versions, key)) continue;
    if (!hasOwn(next, key) || isEmptyMergeValue(next[key])) {
      if (!isEmptyMergeValue(value)) next[key] = value;
    }
  }

  for (const key of MERGE_ARRAY_FIELD_KEYS) {
    next[key] = mergeRecordArray(
      Array.isArray(existingLeak?.[key]) ? existingLeak[key] : [],
      Array.isArray(incomingLeak?.[key]) ? incomingLeak[key] : [],
      key,
      options,
    );
  }

  next.id = existingLeak?.id ?? incomingLeak?.id;
  next.index = existingLeak?.index ?? incomingLeak?.index;
  next.updatedAt = Math.max(
    parseTime(existingLeak?.updatedAt),
    parseTime(incomingLeak?.updatedAt),
  );
  next[LEAK_FIELD_VERSIONS_KEY] = versions;
  return next;
}

function getMonitoringDerivedStatus(result) {
  if (result === "resolved") return "resolved";
  if (result === "needs_recheck") return "in_progress";
  return "open";
}

function applyMonitoringDerivedStatus(leak, options = {}) {
  if (options.source !== "excel") return leak;
  const inferredIds = options.inferredStatusLeakIds;
  const leakId = normalizeLeakTag(leak?.leak_id);
  const shouldInfer =
    inferredIds instanceof Set
      ? inferredIds.has(leakId)
      : Array.isArray(inferredIds) && inferredIds.includes(leakId);
  if (!shouldInfer) return leak;

  const records = Array.isArray(leak?.monitoringRecords)
    ? leak.monitoringRecords
    : [];
  const latestMonitoring = records.at(-1);
  if (!latestMonitoring) return leak;

  const next = {
    ...leak,
    status: getMonitoringDerivedStatus(latestMonitoring.result),
  };
  if (next.status === "resolved") {
    if (isEmptyMergeValue(next.resolvedAt)) {
      next.resolvedAt = latestMonitoring.date;
    }
  } else {
    delete next.resolvedAt;
  }
  return next;
}

function hasFieldVersionMetadata(leak) {
  return (
    Object.keys(normalizeLeakFieldVersions(leak?.[LEAK_FIELD_VERSIONS_KEY]))
      .length > 0
  );
}

function shouldUseVersionedArchiveMerge(
  existingLeak,
  incomingLeak,
  options = {},
) {
  if (options.source === "sync") return true;
  if (options.source !== "archive") return false;
  return (
    hasFieldVersionMetadata(existingLeak) &&
    hasFieldVersionMetadata(incomingLeak)
  );
}

function mergeFreshLeakFields(existingLeak, incomingLeak, options = {}) {
  const hasMixedFieldVersionFormats =
    hasFieldVersionMetadata(existingLeak) !==
    hasFieldVersionMetadata(incomingLeak);
  if (
    (options.source === "archive" || options.source === "sync") &&
    hasMixedFieldVersionFormats
  ) {
    const merged = mergeMixedFormatLeak(existingLeak, incomingLeak, options);
    if (options.addHistory) {
      const changes = buildMergeHistoryChanges(existingLeak, merged, options);
      const monitoringChanged =
        JSON.stringify(existingLeak?.monitoringRecords ?? []) !==
        JSON.stringify(merged.monitoringRecords ?? []);
      if (changes.length > 0 || monitoringChanged) {
        merged.history = [
          ...(Array.isArray(merged.history) ? merged.history : []),
          {
            action: "edited",
            date: new Date().toISOString(),
            text: "Обновлено при объединении импорта",
            changes,
          },
        ];
      }
    }
    return merged;
  }

  if (shouldUseVersionedArchiveMerge(existingLeak, incomingLeak, options)) {
    const merged = mergeVersionedLeakFields(
      existingLeak,
      incomingLeak,
      options,
    );
    if (options.source === "sync") return merged;

    if (options.addHistory) {
      const changes = buildMergeHistoryChanges(existingLeak, merged, options);
      const historyChanged =
        JSON.stringify(existingLeak?.history ?? []) !==
        JSON.stringify(merged.history ?? []);
      const monitoringChanged =
        JSON.stringify(existingLeak?.monitoringRecords ?? []) !==
        JSON.stringify(merged.monitoringRecords ?? []);

      if (changes.length > 0 || historyChanged || monitoringChanged) {
        merged.history = [
          ...(Array.isArray(merged.history) ? merged.history : []),
          {
            action: "edited",
            date: new Date().toISOString(),
            text: "Обновлено при объединении импорта",
            changes,
          },
        ];
      }
    }
    return merged;
  }

  const next = { ...existingLeak };
  const historyBeforeMerge = Array.isArray(existingLeak?.history)
    ? existingLeak.history
    : [];

  for (const [key, value] of Object.entries(incomingLeak ?? {})) {
    if (MERGE_IGNORED_FIELD_KEYS.has(key)) continue;

    if (MERGE_ARRAY_FIELD_KEYS.has(key)) {
      next[key] = mergeRecordArray(
        Array.isArray(existingLeak?.[key]) ? existingLeak[key] : [],
        Array.isArray(value) ? value : [],
        key,
        options,
      );
      continue;
    }

    if (!isEmptyMergeValue(value)) {
      next[key] = value;
    }
  }

  next.id = existingLeak?.id ?? incomingLeak?.id;
  next.index = existingLeak?.index ?? incomingLeak?.index;

  let merged = mergePhotoFields(existingLeak, next);
  merged = applyMonitoringDerivedStatus(merged, options);

  if (options.addHistory) {
    const changes = buildMergeHistoryChanges(existingLeak, merged, options);
    const mergedHistory = Array.isArray(merged.history)
      ? merged.history
      : historyBeforeMerge;
    const historyChanged =
      JSON.stringify(historyBeforeMerge) !== JSON.stringify(mergedHistory);
    const monitoringChanged =
      JSON.stringify(existingLeak?.monitoringRecords ?? []) !==
      JSON.stringify(merged.monitoringRecords ?? []);

    if (changes.length > 0 || historyChanged || monitoringChanged) {
      merged.history = [
        ...mergedHistory,
        {
          action: "edited",
          date: new Date().toISOString(),
          text:
            options.source === "excel"
              ? "Обновлено при импорте Excel"
              : "Обновлено при объединении импорта",
          changes,
        },
      ];
    }
  }

  return merged;
}

export function getChangedFieldKeys(existingLeak, incomingLeak, options = {}) {
  const merged = mergeFreshLeakFields(existingLeak, incomingLeak, options);
  const keys = new Set([
    ...Object.keys(existingLeak ?? {}),
    ...Object.keys(incomingLeak ?? {}),
  ]);

  return [...keys].filter((key) => {
    if (MERGE_IGNORED_FIELD_KEYS.has(key)) return false;
    if (options.source === "excel" && EXCEL_DERIVED_FIELD_KEYS.has(key)) {
      return false;
    }
    if (MERGE_ARRAY_FIELD_KEYS.has(key)) {
      const normalizeRecords = (records) =>
        [...(records ?? [])].sort((left, right) => {
          const timeDifference = parseTime(left?.date) - parseTime(right?.date);
          if (timeDifference !== 0) return timeDifference;
          return JSON.stringify(left).localeCompare(JSON.stringify(right));
        });
      return (
        JSON.stringify(normalizeRecords(existingLeak?.[key])) !==
        JSON.stringify(normalizeRecords(merged?.[key]))
      );
    }
    return !mergeFieldValuesEqual(
      key,
      existingLeak?.[key],
      merged?.[key],
      options,
    );
  });
}

export function mergeLeaksByFreshness(
  existing = [],
  incoming = [],
  options = {},
) {
  const merged = [...existing];
  const indexByIdentity = new Map();
  let added = 0;
  let updated = 0;
  let changedFields = 0;

  merged.forEach((leak, index) => {
    const identity = getLeakIdentity(leak, options);
    if (identity) indexByIdentity.set(identity, index);
  });

  for (const leak of incoming) {
    const identity = getLeakIdentity(leak, options);
    const existingIndex = identity ? indexByIdentity.get(identity) : undefined;

    if (existingIndex == null) {
      merged.push(leak);
      if (identity) indexByIdentity.set(identity, merged.length - 1);
      added += 1;
      continue;
    }

    const changedFieldKeys = getChangedFieldKeys(
      merged[existingIndex],
      leak,
      options,
    );
    const shouldApply = shouldApplyIncomingLeak(
      merged[existingIndex],
      leak,
      options,
      changedFieldKeys.length > 0,
    );

    if (shouldApply) {
      changedFields += changedFieldKeys.length;
      merged[existingIndex] = mergeFreshLeakFields(
        merged[existingIndex],
        leak,
        {
          ...options,
          addHistory: options.source !== "sync",
        },
      );
      updated += 1;
    }
  }

  return {
    leaks: merged,
    added,
    updated,
    changed: added + updated,
    changedFields,
  };
}
