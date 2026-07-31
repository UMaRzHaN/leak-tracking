import {
  LEAK_FIELD_VERSIONS_KEY,
  getLeakFieldVersion,
  isVersionedLeakField,
  normalizeLeakFieldVersions,
} from "@/services/leakFieldVersions";
import { getLeakMergeIdentity } from "@/services/projectSyncState";
import { MONITORING_PHOTO_KEY, PHOTO_KEYS } from "./constants";
import { parseTime } from "./projectMeta";

function getLeakIdentity(leak, options = {}) {
  if (options.source !== "sync") {
    const leakTag = String(leak?.leak_id ?? "").trim();
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

function shouldApplyIncomingLeak(
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

const MERGE_IGNORED_FIELD_KEYS = new Set([
  "id",
  "index",
  "created_at",
  "createdAt",
  "updatedAt",
  "importedAt",
  "importedFromExcel",
  "time",
  LEAK_FIELD_VERSIONS_KEY,
]);

const MERGE_ARRAY_FIELD_KEYS = new Set(["history", "monitoringRecords"]);
const EXCEL_DERIVED_FIELD_KEYS = new Set([
  "temperature_K",
  "leak_speed_kg_m",
  "leak_speed_kg_h",
  "flareShare",
  "utilShare",
  "weightedGWP",
  "Total_Annual_Methane_Loss_m3_y",
  "Total_Annual_Methane_Loss_kg_y",
  "Total_Annual_Methane_Loss_t_y",
  "Emissions_t_CO2eq_year",
  "Emissions_kg_CO2_eq_year",
  "priority",
  "repairAt",
]);
const EXCEL_DATE_FIELD_KEYS = new Set(["date", "resolvedAt"]);

function isEmptyMergeValue(value) {
  return (
    value == null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function comparableMergeValue(value) {
  if (isEmptyMergeValue(value)) return "";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  }
  return String(value).trim();
}

function comparableExcelDate(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;
  }
  if (typeof value === "number" && value > 100000000000) {
    return comparableExcelDate(new Date(value));
  }

  const text = String(value).trim();
  const dotted = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dotted) {
    const year = dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3];
    return `${year}-${Number(dotted[2])}-${Number(dotted[1])}`;
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? comparableExcelDate(parsed) : text;
}

function mergeFieldValuesEqual(key, left, right, options = {}) {
  if (options.source === "excel" && EXCEL_DATE_FIELD_KEYS.has(key)) {
    return comparableExcelDate(left) === comparableExcelDate(right);
  }
  return comparableMergeValue(left) === comparableMergeValue(right);
}

function serializeMergeHistoryValue(value) {
  if (isEmptyMergeValue(value)) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === "string") {
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  }
  return "[changed]";
}

function buildMergeHistoryChanges(existingLeak, mergedLeak, options = {}) {
  const keys = new Set([
    ...Object.keys(existingLeak ?? {}),
    ...Object.keys(mergedLeak ?? {}),
  ]);

  return [...keys]
    .filter(
      (key) =>
        !MERGE_IGNORED_FIELD_KEYS.has(key) &&
        !MERGE_ARRAY_FIELD_KEYS.has(key) &&
        !(options.source === "excel" && EXCEL_DERIVED_FIELD_KEYS.has(key)) &&
        !mergeFieldValuesEqual(
          key,
          existingLeak?.[key],
          mergedLeak?.[key],
          options,
        ),
    )
    .map((key) => {
      if (PHOTO_KEYS.includes(key)) {
        return {
          key,
          kind: "photo",
          from: Boolean(existingLeak?.[key]),
          to: Boolean(mergedLeak?.[key]),
        };
      }

      return {
        key,
        from: serializeMergeHistoryValue(existingLeak?.[key]),
        to: serializeMergeHistoryValue(mergedLeak?.[key]),
      };
    });
}

function getRecordMergeIdentity(record, index, arrayKey) {
  if (arrayKey === "monitoringRecords" && record?.id != null) {
    return `id:${String(record.id)}`;
  }
  if (arrayKey === "monitoringRecords" && record?.photo) {
    return `monitoring-photo:${String(record.photo)}`;
  }
  if (arrayKey === "monitoringRecords" && record?.date) {
    return `monitoring:${getRecordDateIdentity(record.date)}|${String(record?.result ?? "")}`;
  }
  if (arrayKey === "history" && record?.date) {
    return [
      "history",
      getRecordDateIdentity(record.date),
      record?.action ?? "",
      record?.to ?? "",
      record?.text ?? "",
    ]
      .map(String)
      .join("|");
  }
  if (record?.id != null) return `id:${String(record.id)}`;
  return `index:${index}`;
}

function getRecordDateIdentity(value) {
  const time = parseTime(value);
  if (time > 0) return String(time);
  const text = String(value ?? "").trim();
  const dotted = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!dotted) return text;
  const year = dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3];
  return `${year}-${Number(dotted[2])}-${Number(dotted[1])}`;
}

function recordHasFieldVersions(record) {
  return (
    Object.keys(normalizeLeakFieldVersions(record?._fieldUpdatedAt)).length > 0
  );
}

function getRecordFieldVersion(record, key) {
  const versions = normalizeLeakFieldVersions(record?._fieldUpdatedAt);
  return (
    versions[key] ??
    Math.max(parseTime(record?.updatedAt), parseTime(record?.createdAt))
  );
}

function isMonitoringMergeField(key) {
  return !new Set([
    "id",
    "roundId",
    "roundNumber",
    "updatedAt",
    "createdAt",
    "_fieldUpdatedAt",
  ]).has(key);
}

function mergeVersionedMonitoringRecord(current, incoming) {
  const currentVersions = normalizeLeakFieldVersions(current?._fieldUpdatedAt);
  const incomingVersions = normalizeLeakFieldVersions(
    incoming?._fieldUpdatedAt,
  );
  const next = { ...current };
  const mergedVersions = { ...currentVersions };
  const keys = new Set([
    ...Object.keys(current ?? {}),
    ...Object.keys(incoming ?? {}),
    ...Object.keys(currentVersions),
    ...Object.keys(incomingVersions),
  ]);

  for (const key of keys) {
    if (!isMonitoringMergeField(key)) continue;
    const currentHasValue = hasOwn(current ?? {}, key);
    const incomingHasValue = hasOwn(incoming ?? {}, key);
    const currentVersion = getRecordFieldVersion(current, key);
    const incomingVersion = getRecordFieldVersion(incoming, key);
    mergedVersions[key] = Math.max(currentVersion, incomingVersion);
    const incomingWins =
      incomingVersion > currentVersion ||
      (incomingVersion === currentVersion &&
        stableSyncValue(incomingHasValue, incoming?.[key]) >
          stableSyncValue(currentHasValue, current?.[key]));
    if (!incomingWins) continue;
    if (incomingHasValue) next[key] = incoming[key];
    else delete next[key];
  }

  next.id = current?.id ?? incoming?.id;
  if (current?.roundId != null) next.roundId = current.roundId;
  else if (incoming?.roundId != null) next.roundId = incoming.roundId;
  if (current?.roundNumber != null) next.roundNumber = current.roundNumber;
  else if (incoming?.roundNumber != null)
    next.roundNumber = incoming.roundNumber;
  next.updatedAt = Math.max(
    parseTime(current?.updatedAt),
    parseTime(incoming?.updatedAt),
  );
  next._fieldUpdatedAt = mergedVersions;
  return next;
}

function mergeMixedMonitoringRecord(current, incoming) {
  const currentVersioned = recordHasFieldVersions(current);
  const versioned = currentVersioned ? current : incoming;
  const legacy = currentVersioned ? incoming : current;
  const versions = normalizeLeakFieldVersions(versioned?._fieldUpdatedAt);
  const next = { ...versioned };

  for (const [key, value] of Object.entries(legacy ?? {})) {
    if (!isMonitoringMergeField(key)) continue;
    const explicitlyVersioned = hasOwn(versions, key);
    if (explicitlyVersioned) continue;
    if (!hasOwn(next, key) || isEmptyMergeValue(next[key])) {
      if (!isEmptyMergeValue(value)) next[key] = value;
    }
  }

  next.id = current?.id ?? incoming?.id;
  if (current?.roundId != null) next.roundId = current.roundId;
  if (current?.roundNumber != null) next.roundNumber = current.roundNumber;
  return next;
}

function mergeMonitoringRecord(current, incoming) {
  const currentVersioned = recordHasFieldVersions(current);
  const incomingVersioned = recordHasFieldVersions(incoming);
  if (currentVersioned && incomingVersioned) {
    return mergeVersionedMonitoringRecord(current, incoming);
  }
  if (currentVersioned || incomingVersioned) {
    return mergeMixedMonitoringRecord(current, incoming);
  }

  const currentTime = Math.max(
    parseTime(current?.updatedAt),
    parseTime(current?.date),
  );
  const incomingTime = Math.max(
    parseTime(incoming?.updatedAt),
    parseTime(incoming?.date),
  );
  const preferred = incomingTime > currentTime ? incoming : current;
  const fallback = preferred === incoming ? current : incoming;
  const next = { ...fallback };
  for (const [key, value] of Object.entries(preferred ?? {})) {
    if (!isEmptyMergeValue(value)) next[key] = value;
  }

  // Photo repository paths are device-local implementation details. During an
  // import/sync the incoming photo has already been restored into this device's
  // storage, so retain that valid restored path even when the logical record
  // timestamp is equal to the local record timestamp.
  if (!isEmptyMergeValue(incoming?.photo)) {
    next.photo = incoming.photo;
  }

  next.id = current?.id ?? incoming?.id;
  return next;
}

function mergeRecordArray(
  existingRecords = [],
  incomingRecords = [],
  arrayKey,
  options = {},
) {
  const merged = [...existingRecords];
  const indexByIdentity = new Map();

  merged.forEach((record, index) => {
    indexByIdentity.set(getRecordMergeIdentity(record, index, arrayKey), index);
  });

  incomingRecords.forEach((record, index) => {
    const identity = getRecordMergeIdentity(record, index, arrayKey);
    let existingIndex = indexByIdentity.get(identity);
    let matchedExcelCalendarRow = false;

    // Prefer the exported timestamp when it is available. Date-only workbooks
    // still need the legacy calendar-day fallback, but a timed record must never
    // overwrite the first monitoring entry from the same day.
    if (options.source === "excel" && arrayKey === "monitoringRecords") {
      const recordTime = parseTime(record?.date);
      const recordHasTimeOfDay = (() => {
        const parsed = new Date(record?.date);
        if (!Number.isFinite(parsed.getTime())) return false;
        const isLocalMidnight =
          parsed.getHours() === 0 &&
          parsed.getMinutes() === 0 &&
          parsed.getSeconds() === 0 &&
          parsed.getMilliseconds() === 0;
        const isUtcMidnight =
          parsed.getUTCHours() === 0 &&
          parsed.getUTCMinutes() === 0 &&
          parsed.getUTCSeconds() === 0 &&
          parsed.getUTCMilliseconds() === 0;
        return !isLocalMidnight && !isUtcMidnight;
      })();
      const matchesExcelTimestamp = (current) =>
        (Number(current?.roundNumber) || 1) ===
          (Number(record?.roundNumber) || 1) &&
        parseTime(current?.date) === recordTime;
      const matchesExcelCalendarRow = (current) =>
        (Number(current?.roundNumber) || 1) ===
          (Number(record?.roundNumber) || 1) &&
        comparableExcelDate(current?.date) ===
          comparableExcelDate(record?.date);

      if (existingIndex != null) {
        matchedExcelCalendarRow = matchesExcelCalendarRow(
          merged[existingIndex],
        );
      } else {
        existingIndex = merged.findIndex(matchesExcelTimestamp);
        if (existingIndex < 0 && !recordHasTimeOfDay) {
          existingIndex = merged.findIndex(matchesExcelCalendarRow);
        }
        matchedExcelCalendarRow = existingIndex >= 0;
        if (existingIndex < 0) existingIndex = undefined;
      }
    }

    if (existingIndex == null) {
      indexByIdentity.set(identity, merged.length);
      merged.push(record);
      return;
    }

    const current = merged[existingIndex];
    if (arrayKey === "monitoringRecords" && options.source !== "excel") {
      merged[existingIndex] = mergeMonitoringRecord(current, record);
      return;
    }
    if (
      matchedExcelCalendarRow ||
      parseTime(record?.date) >= parseTime(current?.date)
    ) {
      const next = { ...current };
      for (const [key, value] of Object.entries(record ?? {})) {
        if (arrayKey === "history" && key === "user") continue;
        if (arrayKey === "monitoringRecords" && key === "date") continue;
        if (
          key === "date" &&
          getRecordDateIdentity(current?.date) === getRecordDateIdentity(value)
        ) {
          continue;
        }
        if (!isEmptyMergeValue(value)) next[key] = value;
      }
      if (current?.id != null) next.id = current.id;
      else delete next.id;
      if (current?.roundId != null) next.roundId = current.roundId;
      else delete next.roundId;
      if (current?.roundNumber != null) next.roundNumber = current.roundNumber;
      else delete next.roundNumber;
      merged[existingIndex] = next;
    }
  });

  return merged.sort(
    (left, right) => parseTime(left?.date) - parseTime(right?.date),
  );
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function stableSyncValue(hasValue, value) {
  if (!hasValue) return "0:deleted";
  if (value === undefined) return "1:undefined";
  return `2:${JSON.stringify(normalizeSyncConflictValue(value))}`;
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
  const leakId = String(leak?.leak_id ?? "");
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

function getChangedFieldKeys(existingLeak, incomingLeak, options = {}) {
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
    ? leak.monitoringRecords.filter((record) =>
        hasImportablePhoto(record, MONITORING_PHOTO_KEY),
      ).length
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
    classify(record?.photo, existingRecord?.photo);
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
