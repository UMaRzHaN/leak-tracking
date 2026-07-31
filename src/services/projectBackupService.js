// Dynamic imports for heavy export libraries - loaded on-demand only
const getJSZip = () => import("jszip");

import { STORAGE_KEYS } from "@/app/project/storageKeys";
import {
  clearProjectSettings,
  normalizeProjectSettings,
  readProjectSettings,
  shouldApplyIncomingProjectSettings,
  writeProjectSettings,
} from "@/app/project/projectSettings";
import { VAR_DEFAULTS } from "@/data/variables";
import { getPhotoSrc } from "@/hooks/photoService";
import {
  LeakRepository,
  getPreservedInvalidLeakRecords,
} from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import {
  validateBackup,
  validateBackupRecovery,
  validateProjectBackupMeta,
} from "@/repositories/backupSchema";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import { calculateLeakWithSnapshot } from "@/utils/calculationParams";
import { blobToDataUri, dataUrlToBlob } from "@/utils/photoConversion";
import {
  getRestoredMonitoringRound,
  readMonitoringRound,
  saveMonitoringRound,
} from "@/utils/monitoringRound";
import { normalizeProjectVarsUnits } from "@/utils/projectVars";
import {
  applyProjectTombstones,
  assertProjectSyncStateCompatible,
  clearProjectSyncState,
  getLeakMergeIdentity,
  mergeProjectSyncStates,
  readProjectSyncState,
  readProjectSyncStateAsync,
  writeProjectSyncState,
} from "@/services/projectSyncState";
import {
  assertImportFileSize,
  IMPORT_LIMITS,
  preflightZipFile,
  verifyArchiveLimits,
} from "@/utils/importLimits";
import { rollbackImportedProject } from "@/services/projectCleanup";
import {
  LEAK_FIELD_VERSIONS_KEY,
  getLeakFieldVersion,
  isVersionedLeakField,
  normalizeLeakFieldVersions,
} from "@/services/leakFieldVersions";
import { logger } from "@/utils/logger";
import { fingerprintBlob } from "@/utils/blobHash";
import {
  allocateUniqueLeakArchiveSegments,
  buildLeakPhotoArchivePath,
  buildMonitoringPhotoArchivePath,
  getImageMimeTypeFromExtension,
  normalizeImageExtension,
  parseDataImageUri,
} from "@/services/archivePaths";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const EXPORT_YIELD_EVERY = 25;
const EXPORT_CONCURRENCY = 8;
const IMPORT_CONCURRENCY = 3;

function yieldToMainThread() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

const PHOTO_KEYS = ["photo", "photo_after", "photo_repair"];
const MONITORING_PHOTO_KEY = "photo";
const RECOVERY_RECORDS_FILE = "recovery-invalid-records.json";

/** Maps unique field keys to their project type. */
const TYPE_SIGNATURES = {
  midstream: ["station", "field"],
  upstream: ["subdivision", "deposit"],
  downstream: ["district", "locality", "address"],
};

async function resolveBase64(path, idbGet) {
  if (typeof path !== "string" || !path) return null;

  let src = null;
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

async function resolvePhotoBlob(path, idbGet) {
  if (typeof path !== "string" || !path) return null;

  let value = null;
  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    value = idbGet ? await idbGet(id) : null;
  } else if (path.startsWith("data:image/")) {
    value = path;
  } else {
    value = await getPhotoSrc(path);
  }
  if (!value) return null;

  const blob = value instanceof Blob ? value : dataUrlToBlob(value);
  if (!blob) return null;
  const mime = blob.type || String(value).match(/^data:([^;]+);base64,/)?.[1];
  if (!mime?.startsWith("image/")) return null;
  return { blob, ext: normalizeImageExtension(mime) };
}

async function exportLeaksWithPhotosToStream(
  leaks,
  zip,
  idbGet,
  {
    segmentPrefix = "leak",
    preserveUnresolvedPhotoPaths = false,
    leakSegments: providedLeakSegments = null,
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
    }

    if (Array.isArray(copy.monitoringRecords)) {
      const records = [];
      for (const [recordIndex, record] of copy.monitoringRecords.entries()) {
        const path = record?.[MONITORING_PHOTO_KEY];
        if (path == null) {
          records.push(record);
          continue;
        }
        const resolved = await resolvePhotoBlob(path, idbGet);
        if (!resolved) {
          if (preserveUnresolvedPhotoPaths) {
            records.push(record);
            continue;
          }
          const sanitizedRecord = { ...record };
          delete sanitizedRecord[MONITORING_PHOTO_KEY];
          records.push(sanitizedRecord);
          continue;
        }
        const archivePath = buildMonitoringPhotoArchivePath(
          leakNumber,
          recordIndex,
          resolved.ext,
        );
        await zip.add(archivePath, resolved.blob);
        records.push({
          ...record,
          [MONITORING_PHOTO_KEY]: `zip:${archivePath}`,
        });
      }
      copy.monitoringRecords = records;
    }
    exported[index] = copy;
  }

  return exported;
}
async function exportLeaksWithPhotos(
  leaks,
  zip,
  idbGet,
  {
    segmentPrefix = "leak",
    preserveUnresolvedPhotoPaths = false,
    leakSegments: providedLeakSegments = null,
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
    }

    if (Array.isArray(copy.monitoringRecords)) {
      const records = [];
      for (const [recordIndex, record] of copy.monitoringRecords.entries()) {
        const path = record?.[MONITORING_PHOTO_KEY];
        if (path == null) {
          records.push(record);
          continue;
        }

        const resolved = await resolveBase64(path, idbGet);
        if (!resolved) {
          if (preserveUnresolvedPhotoPaths) {
            records.push(record);
            continue;
          }
          const sanitizedRecord = { ...record };
          delete sanitizedRecord[MONITORING_PHOTO_KEY];
          records.push(sanitizedRecord);
          continue;
        }

        const archivePath = buildMonitoringPhotoArchivePath(
          leakNumber,
          recordIndex,
          resolved.ext,
        );
        zip.file(archivePath, resolved.base64, { base64: true });
        records.push({
          ...record,
          [MONITORING_PHOTO_KEY]: `zip:${archivePath}`,
        });
      }
      copy.monitoringRecords = records;
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

function buildProjectMeta({
  project,
  vars,
  settings,
  monitoringRound,
  syncState,
} = {}) {
  if (!project) return null;

  return {
    schemaVersion: 5,
    exportedAt: new Date().toISOString(),
    project: {
      name: project.name,
      type: project.type,
      folderName: project.folderName,
      syncId: project.syncId,
    },
    vars: vars ?? undefined,
    settings: settings ?? undefined,
    monitoringRound: monitoringRound ?? undefined,
    sync: syncState ?? undefined,
  };
}

function normalizeImportedVars(vars) {
  if (!vars) return vars;

  const next = { ...normalizeProjectVarsUnits(vars) };

  if (isPinkBagEquipment(next.equipmentType)) {
    next.equipmentType = "Розовый мешок";
  }

  return next;
}

function normalizeProjectMeta(meta) {
  if (!meta) return meta;
  return {
    ...meta,
    ...(meta.vars ? { vars: normalizeImportedVars(meta.vars) } : {}),
    ...(meta.settings
      ? { settings: normalizeProjectSettings(meta.settings) }
      : {}),
  };
}

function readStoredProjectVars(projectId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROJECT_VARS(projectId));
    return raw ? normalizeImportedVars(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function monitoringRoundFreshness(round) {
  if (!round) return 0;
  return Math.max(parseTime(round.completedAt), parseTime(round.startedAt));
}

function recalculateLeaks(leaks, vars) {
  if (!vars) return leaks;
  const calcVars = { ...VAR_DEFAULTS, ...vars };
  return leaks.map((leak) => calculateLeakWithSnapshot(leak, calcVars));
}

function parseTime(value) {
  if (value == null || value === "") return 0;
  const numeric = Number(value);
  const time =
    typeof value === "number" ||
    (typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(numeric))
      ? numeric
      : Date.parse(String(value));
  return Number.isFinite(time) && time > 0 ? time : 0;
}

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

function filterIncomingLeaksForMerge(
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

function parseBackupValidation(parsed) {
  const validation = validateBackup(parsed);
  if (!validation.ok) throw new Error(validation.error);
  return validation.data;
}

function parseRecoveryValidation(parsed) {
  const validation = validateBackupRecovery(parsed);
  if (!validation.ok) throw new Error(validation.error);
  return validation.data;
}

function assertArchivePhotoReferences(leaks, zip) {
  const assertPhoto = (path) => {
    if (typeof path !== "string" || !path.startsWith("zip:")) return;
    const relativePath = path.slice("zip:".length);
    const entry = zip.file(relativePath);
    if (!entry || entry.dir) {
      throw new Error(`Файл фото "${relativePath}" не найден в архиве`);
    }
  };

  for (const leak of leaks) {
    for (const key of PHOTO_KEYS) assertPhoto(leak?.[key]);
    if (Array.isArray(leak?.monitoringRecords)) {
      for (const record of leak.monitoringRecords) {
        assertPhoto(record?.[MONITORING_PHOTO_KEY]);
      }
    }
  }
}

async function parseZipMeta(zip) {
  const metaFile = zip.file("project.json");
  if (!metaFile) return null;

  try {
    const parsedMeta = JSON.parse(await metaFile.async("string"));
    const metaValidation = validateProjectBackupMeta(parsedMeta);
    if (metaValidation.ok) return normalizeProjectMeta(metaValidation.data);
    const legacyProject = parsedMeta?.project;
    if (
      typeof legacyProject?.name === "string" &&
      legacyProject.name.trim() &&
      Object.hasOwn(TYPE_SIGNATURES, legacyProject.type)
    ) {
      // Old project.json variants are still useful for identifying the
      // project, but none of their unvalidated optional metadata is trusted.
      return {
        project: {
          name: legacyProject.name.trim(),
          type: legacyProject.type,
        },
      };
    }
  } catch {
    // ignore invalid project meta
  }

  return null;
}

async function parseBackupZip(zipFile) {
  assertImportFileSize(zipFile);
  await preflightZipFile(zipFile);
  const JSZip = (await getJSZip()).default;
  const zip = await JSZip.loadAsync(zipFile);
  await verifyArchiveLimits(zip);

  const jsonFile = zip.file("backup.json");
  if (!jsonFile) throw new Error("Файл backup.json не найден в архиве");

  let parsed;
  try {
    parsed = JSON.parse(await jsonFile.async("string"));
  } catch {
    throw new Error("backup.json содержит невалидный JSON");
  }

  const leaks = parseBackupValidation(parsed);
  assertArchivePhotoReferences(leaks, zip);
  const recoveryFile = zip.file(RECOVERY_RECORDS_FILE);
  let recoveryRecords = [];
  if (recoveryFile) {
    let parsedRecovery;
    try {
      parsedRecovery = JSON.parse(await recoveryFile.async("string"));
    } catch {
      throw new Error(`${RECOVERY_RECORDS_FILE} содержит невалидный JSON`);
    }
    recoveryRecords = parseRecoveryValidation(parsedRecovery);
    assertArchivePhotoReferences(recoveryRecords, zip);
  }
  return {
    zip,
    leaks,
    recoveryRecords,
    meta: await parseZipMeta(zip),
  };
}

async function restorePhotosFromZip(
  leaks,
  zip,
  savePhotoRefOrFn,
  { keyPrefix = "" } = {},
) {
  const savePhoto =
    typeof savePhotoRefOrFn === "function"
      ? savePhotoRefOrFn
      : savePhotoRefOrFn?.current;

  const archivePhotoSizes = [];
  const collectSize = (path) => {
    if (typeof path !== "string" || !path.startsWith("zip:")) return;
    const entry = zip.file(path.slice("zip:".length));
    const size = Number(entry?._data?.uncompressedSize);
    if (Number.isFinite(size) && size > 0) archivePhotoSizes.push(size);
  };
  for (const leak of leaks) {
    for (const key of PHOTO_KEYS) collectSize(leak?.[key]);
    for (const record of leak?.monitoringRecords ?? []) {
      collectSize(record?.[MONITORING_PHOTO_KEY]);
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
    if (path.startsWith("zip:")) {
      const relativePath = path.slice("zip:".length);
      const photoFile = zip.file(relativePath);
      if (!photoFile) return null;
      const sourceBlob = await photoFile.async("blob");
      const extension = relativePath.split(".").pop() || "jpg";
      const mime = getImageMimeTypeFromExtension(extension);
      const blob =
        sourceBlob.type === mime
          ? sourceBlob
          : new Blob([sourceBlob], { type: mime });
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
        throw new Error(`Не удалось сохранить фотографию ${path}`);
      }
      copy[key] = newPath ?? prepared.fallbackPath;
      if (newPath) savedPaths[key] = newPath;
    }

    if (Array.isArray(copy.monitoringRecords)) {
      const restoredRecords = [];
      for (const [index, record] of copy.monitoringRecords.entries()) {
        const path = record?.[MONITORING_PHOTO_KEY];
        if (typeof path !== "string" || !path) {
          restoredRecords.push(record);
          continue;
        }

        const prepared = await preparePhoto(path);
        if (!prepared) {
          restoredRecords.push(record);
          continue;
        }

        const recordId = String(record.id ?? index + 1);
        const storageKey = `${baseKey}_monitoring_${recordId}`;
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
          throw new Error(`Не удалось сохранить фотографию ${path}`);
        }
        restoredRecords.push({
          ...record,
          [MONITORING_PHOTO_KEY]: newPath ?? prepared.fallbackPath,
        });
      }
      copy.monitoringRecords = restoredRecords;
    }

    return copy;
  });
}

async function waitForProjectActivation(activeProjectIdRef, projectId) {
  for (let i = 0; i < 60; i++) {
    if (activeProjectIdRef.current === projectId) return;
    await delay(50);
  }

  throw new Error("Таймаут переключения проекта");
}

async function waitForPhotoStorage(photoReadyRef) {
  if (!photoReadyRef) return;

  for (let i = 0; i < 60; i++) {
    if (photoReadyRef.current) return;
    await delay(50);
  }

  throw new Error("Хранилище фото не готово");
}

export async function buildBackupZip(leaks, idbGet) {
  const JSZip = (await getJSZip()).default;
  const zip = new JSZip();

  const exportedLeaks = await exportLeaksWithPhotos(leaks, zip, idbGet);
  await yieldToMainThread();
  zip.file("backup.json", JSON.stringify(exportedLeaks, null, 2));
  await yieldToMainThread();
  const blob = await zip.generateAsync({ type: "blob" });
  assertImportFileSize(blob);
  return blob;
}

export async function streamProjectBackupZip({
  leaks,
  recoveryRecords = [],
  idbGet,
  project,
  vars,
  writeChunk,
}) {
  const { ZipStoreStreamWriter } = await import("@/services/zipStoreStream");
  const zip = new ZipStoreStreamWriter(writeChunk, {
    maxBytes: IMPORT_LIMITS.maxExportBytes,
  });
  const validatedRecovery = recoveryRecords.length
    ? parseRecoveryValidation(recoveryRecords)
    : [];
  const leakSegments = allocateUniqueLeakArchiveSegments(leaks);
  const recoveryLeakSegments = allocateUniqueLeakArchiveSegments(
    validatedRecovery,
    { prefix: "recovery", reservedSegments: leakSegments },
  );
  const exportedLeaks = await exportLeaksWithPhotosToStream(
    leaks,
    zip,
    idbGet,
    {
      leakSegments,
    },
  );
  await zip.add("backup.json", JSON.stringify(exportedLeaks, null, 2));
  if (validatedRecovery.length) {
    const exportedRecovery = await exportLeaksWithPhotosToStream(
      validatedRecovery,
      zip,
      idbGet,
      {
        segmentPrefix: "recovery",
        preserveUnresolvedPhotoPaths: true,
        leakSegments: recoveryLeakSegments,
      },
    );
    await zip.add(
      RECOVERY_RECORDS_FILE,
      JSON.stringify(exportedRecovery, null, 2),
    );
  }

  const meta = buildProjectMeta({
    project,
    vars,
    settings: readProjectSettings(project?.id),
    monitoringRound: readMonitoringRound(project?.id),
    syncState: await readProjectSyncStateAsync(project?.id),
  });
  if (meta) await zip.add("project.json", JSON.stringify(meta, null, 2));
  return zip.close();
}
export async function buildProjectBackupZip({
  leaks,
  recoveryRecords = [],
  idbGet,
  project,
  vars,
}) {
  const JSZip = (await getJSZip()).default;
  const zip = new JSZip();

  const validatedRecovery = recoveryRecords.length
    ? parseRecoveryValidation(recoveryRecords)
    : [];
  const leakSegments = allocateUniqueLeakArchiveSegments(leaks);
  const recoveryLeakSegments = allocateUniqueLeakArchiveSegments(
    validatedRecovery,
    { prefix: "recovery", reservedSegments: leakSegments },
  );
  const exportedLeaks = await exportLeaksWithPhotos(leaks, zip, idbGet, {
    leakSegments,
  });
  await yieldToMainThread();
  zip.file("backup.json", JSON.stringify(exportedLeaks, null, 2));
  if (validatedRecovery.length) {
    const exportedRecovery = await exportLeaksWithPhotos(
      validatedRecovery,
      zip,
      idbGet,
      {
        segmentPrefix: "recovery",
        preserveUnresolvedPhotoPaths: true,
        leakSegments: recoveryLeakSegments,
      },
    );
    zip.file(RECOVERY_RECORDS_FILE, JSON.stringify(exportedRecovery, null, 2));
  }

  const meta = buildProjectMeta({
    project,
    vars,
    settings: readProjectSettings(project?.id),
    monitoringRound: readMonitoringRound(project?.id),
    syncState: await readProjectSyncStateAsync(project?.id),
  });
  if (meta) zip.file("project.json", JSON.stringify(meta, null, 2));

  await yieldToMainThread();
  const blob = await zip.generateAsync({ type: "blob" });
  assertImportFileSize(blob);
  return blob;
}

export async function exportBackupZip(leaks, idbGet, projectName = "backup") {
  const blob = await buildBackupZip(leaks, idbGet);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function detectProjectTypeFromLeaks(leaks) {
  if (!leaks?.length) return null;

  // Scan the complete import, but count only meaningful values. A key with an
  // empty placeholder must not influence detection. Scoring avoids the old
  // "first matching type wins" behaviour and deliberately returns null when
  // two project types have the same evidence so the UI can ask the user.
  const scores = Object.fromEntries(
    Object.keys(TYPE_SIGNATURES).map((type) => [type, 0]),
  );

  for (const leak of leaks) {
    if (!leak || typeof leak !== "object" || Array.isArray(leak)) continue;
    for (const [type, fields] of Object.entries(TYPE_SIGNATURES)) {
      for (const fieldName of fields) {
        const value = leak[fieldName];
        const meaningful =
          value != null &&
          (typeof value !== "string" || value.trim().length > 0);
        if (meaningful) scores[type] += 1;
      }
    }
  }

  const ranked = Object.entries(scores).sort(
    (left, right) => right[1] - left[1],
  );
  const [winner, runnerUp] = ranked;
  if (!winner || winner[1] <= 0) return null;
  if (runnerUp && runnerUp[1] === winner[1]) return null;
  return winner[0];
}

export async function peekBackupZip(zipFile) {
  const { leaks, meta, recoveryRecords } = await parseBackupZip(zipFile);

  return {
    leaks,
    meta,
    recoveryRecordCount: recoveryRecords.length,
    detectedType: detectProjectTypeFromLeaks(leaks),
  };
}

export async function importProjectZip(zipFile, ctx) {
  const {
    addProject,
    removeProject,
    savePhotoRef,
    saveRef,
    activeProjectIdRef,
    photoReadyRef,
    metaFallback,
    overwriteProject,
    selectProject,
  } = ctx;

  const { zip, leaks, meta, recoveryRecords } = await parseBackupZip(zipFile);

  const projectName =
    ctx.overrideName?.trim() || meta?.project?.name || metaFallback?.name;
  const projectType = meta?.project?.type || metaFallback?.type;

  if (!projectName || !projectType) {
    throw new Error(
      "Архив не содержит метаданных проекта. Заполните название и тип проекта.",
    );
  }

  const previousProjectId = activeProjectIdRef?.current ?? null;
  const newProject = meta?.project?.syncId
    ? addProject(projectName, projectType, {
        syncId: meta.project.syncId,
      })
    : addProject(projectName, projectType);
  if (!newProject) throw new Error("Не удалось создать проект");

  try {
    await waitForProjectActivation(activeProjectIdRef, newProject.id);
    await waitForPhotoStorage(photoReadyRef);
    const savePhotoToImportedProject = savePhotoRef?.current;
    const saveImportedProject = saveRef?.current;
    if (
      typeof savePhotoToImportedProject !== "function" ||
      typeof saveImportedProject !== "function"
    ) {
      throw new Error("Хранилище импортируемого проекта не готово");
    }

    if (meta?.vars) {
      localStorage.setItem(
        STORAGE_KEYS.PROJECT_VARS(newProject.id),
        JSON.stringify(meta.vars),
      );
    }
    if (meta?.settings) {
      writeProjectSettings(newProject.id, meta.settings);
    }
    const importedProject = newProject;
    if (meta?.sync) {
      await writeProjectSyncState(newProject.id, meta.sync, []);
    }

    const restoredLeaks = await restorePhotosFromZip(
      leaks,
      zip,
      savePhotoToImportedProject,
    );
    const finalLeaks = recalculateLeaks(restoredLeaks, meta?.vars);
    const restoredRecoveryRecords = await restorePhotosFromZip(
      recoveryRecords,
      zip,
      savePhotoToImportedProject,
      { keyPrefix: "recovery_" },
    );
    saveMonitoringRound(
      newProject.id,
      getRestoredMonitoringRound(meta, finalLeaks),
    );
    await saveImportedProject(finalLeaks, {
      preservedRecords: restoredRecoveryRecords,
    });

    await writeProjectSyncState(newProject.id, meta?.sync, finalLeaks);
    return { project: importedProject, leakCount: finalLeaks.length };
  } catch (error) {
    try {
      await rollbackImportedProject(newProject, removeProject);
    } finally {
      const restoreProject = overwriteProject ?? selectProject;
      if (
        previousProjectId &&
        previousProjectId !== newProject.id &&
        typeof restoreProject === "function"
      ) {
        try {
          restoreProject(previousProjectId);
        } catch (restoreError) {
          logger.warn(
            "[projectBackupService] Import rollback could not restore the previous active project:",
            restoreError,
          );
        }
      }
    }
    throw error;
  }
}

export async function importIntoExistingProject(zipFile, ctx, mode) {
  const {
    overwriteProject,
    saveRef,
    activeProjectIdRef,
    photoReadyRef,
    existingProject,
    setProjectSyncId,
    replaceProjectSyncId,
    restoreProjectSnapshot,
  } = ctx;

  const { id: existingProjectId, folderName: existingFolderName } =
    existingProject;
  const { zip, leaks, meta } = await parseBackupZip(zipFile);

  const isSync = mode === "sync";
  const isMerge = mode === "merge" || isSync;
  const incomingProjectType =
    typeof meta?.project?.type === "string"
      ? meta.project.type.trim().toLowerCase()
      : null;
  const existingProjectType =
    typeof existingProject.type === "string"
      ? existingProject.type.trim().toLowerCase()
      : null;

  if (!incomingProjectType) {
    const error = new Error(
      "Не удалось определить тип проекта в импортируемом архиве",
    );
    error.code = "PROJECT_TYPE_MISSING";
    error.existingProjectType = existingProjectType;
    throw error;
  }

  if (!existingProjectType) {
    const error = new Error("Не удалось определить тип текущего проекта");
    error.code = "CURRENT_PROJECT_TYPE_MISSING";
    error.incomingProjectType = incomingProjectType;
    throw error;
  }

  if (incomingProjectType !== existingProjectType) {
    const error = new Error(
      "Тип импортируемого проекта не соответствует текущему проекту",
    );
    error.code = "PROJECT_TYPE_MISMATCH";
    error.incomingProjectType = incomingProjectType;
    error.existingProjectType = existingProjectType;
    throw error;
  }

  const incomingSyncId = meta?.project?.syncId?.trim().toLowerCase() || null;
  const existingSyncId = existingProject.syncId?.trim().toLowerCase() || null;
  if (
    isSync &&
    existingSyncId &&
    incomingSyncId &&
    incomingSyncId !== existingSyncId
  ) {
    throw new Error("Архив получен из другой базы данных");
  }
  if (isSync && !existingSyncId && !incomingSyncId) {
    throw new Error("Архив не содержит идентификатор синхронизации");
  }
  const shouldAdoptSyncId = isSync && !existingSyncId && incomingSyncId;
  const shouldReplaceSyncId =
    mode === "overwrite" &&
    Boolean(incomingSyncId) &&
    incomingSyncId !== existingSyncId;
  if (shouldAdoptSyncId && typeof setProjectSyncId !== "function") {
    throw new Error("Не удалось сохранить идентификатор синхронизации");
  }
  if (shouldReplaceSyncId && typeof replaceProjectSyncId !== "function") {
    throw new Error("Не удалось заменить идентификатор синхронизации");
  }

  const localSyncState = await readProjectSyncStateAsync(existingProjectId);
  const incomingSyncState = meta?.sync;
  if (isSync && incomingSyncState) {
    assertProjectSyncStateCompatible(localSyncState, incomingSyncState);
  }
  const mergedSyncState = mergeProjectSyncStates(
    localSyncState,
    incomingSyncState,
  );
  const shouldApplyIncomingVars =
    isSync &&
    meta?.vars &&
    (incomingSyncState?.varsUpdatedAt ?? 0) > localSyncState.varsUpdatedAt;
  const localSettings = readProjectSettings(existingProjectId);
  const localMonitoringRound = readMonitoringRound(existingProjectId);
  const localVarsRaw = localStorage.getItem(
    STORAGE_KEYS.PROJECT_VARS(existingProjectId),
  );
  const incomingSettings = meta?.settings ?? null;
  const hasIncomingSettings = Boolean(incomingSettings);
  const shouldApplyIncomingSettings =
    mode === "overwrite" ||
    (hasIncomingSettings &&
      mode === "merge" &&
      incomingSettings.updatedAt > localSettings.updatedAt) ||
    (hasIncomingSettings &&
      isSync &&
      shouldApplyIncomingProjectSettings(localSettings, incomingSettings));

  let vars = null;
  if (mode === "overwrite") {
    vars = meta?.vars ?? null;
  }

  await waitForPhotoStorage(photoReadyRef);
  const existing = await LeakRepository.getAll({
    projectId: existingProjectId,
    folderName: existingFolderName,
    ...(existingProject.legacyStorageType
      ? { legacyStorageType: existingProject.legacyStorageType }
      : {}),
  });
  const preservedExisting = getPreservedInvalidLeakRecords(existing);
  const existingForStorage = [...existing, ...preservedExisting];

  // The selected archive can target a project other than the currently active
  // one. Using savePhotoRef here would bind restored photos to the active
  // project's id/folder and make them eligible for deletion by its photo GC.
  const savePhotoToExistingProject = (
    rawPhoto,
    leakId,
    excludePaths = [],
    options = {},
  ) =>
    PhotoRepository.save(
      rawPhoto,
      {
        projectId: existingProjectId,
        leakId,
        folderName: existingFolderName,
      },
      excludePaths,
      options,
    );

  let finalLeaks;
  let addedCount;
  let nextMonitoringRound = null;
  let committedProject = existingProject;
  let dataCommitAttempted = false;
  let syncIdMutationAttempted = false;

  try {
    if (isMerge) {
      const incomingToApply = filterIncomingLeaksForMerge(
        existing,
        isSync ? applyProjectTombstones(leaks, mergedSyncState) : leaks,
        isSync ? { source: "sync" } : { source: "archive" },
      );
      const restoredIncoming = await restorePhotosFromZip(
        incomingToApply,
        zip,
        savePhotoToExistingProject,
      );
      const effectiveVars = shouldApplyIncomingVars
        ? meta?.vars
        : readStoredProjectVars(existingProjectId);
      const recalculatedIncoming = recalculateLeaks(
        restoredIncoming,
        effectiveVars,
      );
      const mergeResult = mergeLeaksByFreshness(
        existing,
        recalculatedIncoming,
        isSync ? { source: "sync" } : { source: "archive" },
      );
      finalLeaks = isSync
        ? applyProjectTombstones(mergeResult.leaks, mergedSyncState)
        : mergeResult.leaks;
      addedCount =
        mergeResult.changed + (mergeResult.leaks.length - finalLeaks.length);
      if (isSync) {
        const currentRound = readMonitoringRound(existingProjectId);
        const incomingRound = getRestoredMonitoringRound(meta, finalLeaks);
        nextMonitoringRound =
          monitoringRoundFreshness(incomingRound) >
          monitoringRoundFreshness(currentRound)
            ? incomingRound
            : currentRound;
      }
    } else {
      const restoredLeaks = await restorePhotosFromZip(
        leaks,
        zip,
        savePhotoToExistingProject,
      );
      finalLeaks = recalculateLeaks(restoredLeaks, meta?.vars);
      addedCount = finalLeaks.length;
      nextMonitoringRound = getRestoredMonitoringRound(meta, finalLeaks);
    }

    // Apply metadata before committing leak data. If the commit fails, restore
    // the captured project snapshot so the import remains all-or-nothing.
    if (mode === "overwrite") {
      if (vars) {
        localStorage.setItem(
          STORAGE_KEYS.PROJECT_VARS(existingProjectId),
          JSON.stringify(vars),
        );
      } else {
        localStorage.removeItem(STORAGE_KEYS.PROJECT_VARS(existingProjectId));
      }
      saveMonitoringRound(existingProjectId, nextMonitoringRound);
      if (incomingSyncState) {
        await writeProjectSyncState(
          existingProjectId,
          incomingSyncState,
          finalLeaks,
        );
      } else {
        await clearProjectSyncState(existingProjectId);
      }
    } else if (isSync) {
      if (shouldApplyIncomingVars) {
        localStorage.setItem(
          STORAGE_KEYS.PROJECT_VARS(existingProjectId),
          JSON.stringify(meta.vars),
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-vars-updated", {
              detail: { projectId: existingProjectId },
            }),
          );
        }
      }
      saveMonitoringRound(existingProjectId, nextMonitoringRound);
      await writeProjectSyncState(
        existingProjectId,
        mergeProjectSyncStates(
          readProjectSyncState(existingProjectId),
          mergedSyncState,
        ),
        finalLeaks,
      );
    }

    if (shouldApplyIncomingSettings) {
      if (incomingSettings) {
        writeProjectSettings(existingProjectId, incomingSettings);
      } else {
        clearProjectSettings(existingProjectId, { emit: true });
      }
    }

    dataCommitAttempted = true;
    if (activeProjectIdRef.current === existingProjectId) {
      await saveRef.current(finalLeaks);
    } else {
      await LeakRepository.saveAll([...finalLeaks, ...preservedExisting], {
        projectId: existingProjectId,
        folderName: existingFolderName,
      });
    }

    // Keep project metadata in the same transaction boundary as leak data.
    // If the setter fails (or mutates and then throws), the catch block below
    // restores both the exact project snapshot and the original leak set.
    if (shouldAdoptSyncId || shouldReplaceSyncId) {
      syncIdMutationAttempted = true;
      committedProject = shouldReplaceSyncId
        ? replaceProjectSyncId(existingProjectId, incomingSyncId)
        : setProjectSyncId(existingProjectId, incomingSyncId);
      if (!committedProject) {
        throw new Error(
          shouldReplaceSyncId
            ? "Не удалось заменить идентификатор синхронизации"
            : "Не удалось сохранить идентификатор синхронизации",
        );
      }
    }
  } catch (error) {
    const rollbackErrors = [];
    if (localVarsRaw == null) {
      localStorage.removeItem(STORAGE_KEYS.PROJECT_VARS(existingProjectId));
    } else {
      localStorage.setItem(
        STORAGE_KEYS.PROJECT_VARS(existingProjectId),
        localVarsRaw,
      );
    }
    writeProjectSettings(existingProjectId, localSettings);
    saveMonitoringRound(existingProjectId, localMonitoringRound);
    await writeProjectSyncState(
      existingProjectId,
      localSyncState,
      existing,
    ).catch((rollbackError) => rollbackErrors.push(rollbackError));

    if (dataCommitAttempted) {
      try {
        if (activeProjectIdRef.current === existingProjectId) {
          await saveRef.current(existing);
        } else {
          await LeakRepository.saveAll(existingForStorage, {
            projectId: existingProjectId,
            folderName: existingFolderName,
          });
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }

    if (syncIdMutationAttempted) {
      if (typeof restoreProjectSnapshot !== "function") {
        rollbackErrors.push(
          new Error("Project metadata rollback is unavailable"),
        );
      } else {
        try {
          const restored = restoreProjectSnapshot(
            existingProjectId,
            existingProject,
          );
          if (!restored) {
            rollbackErrors.push(new Error("Project metadata rollback failed"));
          }
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
    }

    await PhotoRepository.gcOrphaned(existingForStorage, {
      projectId: existingProjectId,
      folderName: existingFolderName,
    }).catch(() => {});
    if (rollbackErrors.length > 0) {
      error.rollbackErrors = rollbackErrors;
      logger.error(
        "[projectBackupService] Import rollback was incomplete:",
        rollbackErrors,
      );
    }
    throw error;
  }

  // Data is committed. Cleanup failure must not turn a successful import into
  // a false "Import error"; orphan cleanup can be retried later.
  await PhotoRepository.gcOrphaned([...finalLeaks, ...preservedExisting], {
    projectId: existingProjectId,
    folderName: existingFolderName,
  }).catch((error) => {
    logger.warn(
      "[projectBackupService] Imported data, but orphaned photos could not be removed:",
      error,
    );
  });
  if (activeProjectIdRef.current !== existingProjectId) {
    const switched = overwriteProject(existingProjectId);
    if (switched) {
      await waitForProjectActivation(
        activeProjectIdRef,
        existingProjectId,
      ).catch((error) => {
        logger.warn(
          "[projectBackupService] Data was imported, but project activation was not observed:",
          error,
        );
      });
    } else {
      logger.warn(
        "[projectBackupService] Data was imported, but the target project could not be activated.",
      );
    }
  }
  return { project: committedProject, leakCount: addedCount };
}

export async function importBackupZip(zipFile, savePhoto) {
  const { zip, leaks, meta } = await parseBackupZip(zipFile);
  const restoredLeaks = await restorePhotosFromZip(leaks, zip, savePhoto);
  return { leaks: recalculateLeaks(restoredLeaks, meta?.vars), meta };
}
