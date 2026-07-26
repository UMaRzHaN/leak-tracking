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
import { LeakRepository } from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import {
  validateBackup,
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
  getLeakMergeIdentity,
  mergeProjectSyncStates,
  readProjectSyncState,
  readProjectSyncStateAsync,
  writeProjectSyncState,
} from "@/services/projectSyncState";
import {
  assertArchiveLimits,
  assertImportFileSize,
} from "@/utils/importLimits";
import { rollbackImportedProject } from "@/services/projectCleanup";
import {
  LEAK_FIELD_VERSIONS_KEY,
  getLeakFieldVersion,
  isVersionedLeakField,
  normalizeLeakFieldVersions,
} from "@/services/leakFieldVersions";
import { logger } from "@/utils/logger";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const EXPORT_YIELD_EVERY = 25;
const EXPORT_CONCURRENCY = 8;
const IMPORT_CONCURRENCY = 4;

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
const SUFFIX = {
  photo: "before",
  photo_after: "after",
  photo_repair: "repair",
};
const MONITORING_PHOTO_KEY = "photo";

/** Maps unique field keys to their project type. */
const TYPE_SIGNATURES = {
  midstream: ["station", "field"],
  upstream: ["subdivision", "deposit"],
  downstream: ["district", "locality", "address"],
};

async function resolveBase64(path, idbGet) {
  if (!path) return null;

  let src = null;
  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    const raw = idbGet ? await idbGet(id) : null;
    // raw can be a Blob (new storage) or a data URI string (legacy storage)
    if (!raw) return null;
    src = raw instanceof Blob ? await blobToDataUri(raw) : raw;
  } else {
    src = await getPhotoSrc(path);
  }

  if (!src || !src.startsWith("data:")) return null;
  const match = src.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  return {
    mime: match[1],
    base64: match[2],
    ext: match[1].split("/")[1] || "jpg",
  };
}

async function exportLeaksWithPhotos(leaks, zip, idbGet) {
  const photosFolder = zip.folder("photos");
  const exported = new Array(leaks.length);
  let cursor = 0;

  async function exportOne(leak, index) {
    const copy = { ...leak };
    const leakNumber = String(leak.leak_id ?? leak.id).replace(/[\\/]/g, "_");
    const leakFolder = photosFolder.folder(leakNumber);

    for (const key of PHOTO_KEYS) {
      const path = leak[key];
      if (!path) continue;
      const resolved = await resolveBase64(path, idbGet);
      if (!resolved) continue;

      const fileName = `${SUFFIX[key]}.${resolved.ext}`;
      leakFolder.file(fileName, resolved.base64, { base64: true });
      copy[key] = `zip:photos/${leakNumber}/${fileName}`;
    }

    if (Array.isArray(copy.monitoringRecords)) {
      const records = [];
      for (const [recordIndex, record] of copy.monitoringRecords.entries()) {
        const path = record?.[MONITORING_PHOTO_KEY];
        if (!path) {
          records.push(record);
          continue;
        }

        const resolved = await resolveBase64(path, idbGet);
        if (!resolved) {
          records.push(record);
          continue;
        }

        const safeRecordId = String(record.id ?? recordIndex + 1).replace(
          /[\\/]/g,
          "_",
        );
        const fileName = `monitoring_${safeRecordId}.${resolved.ext}`;
        leakFolder.file(fileName, resolved.base64, { base64: true });
        records.push({
          ...record,
          [MONITORING_PHOTO_KEY]: `zip:photos/${leakNumber}/${fileName}`,
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

function getLeakIdentity(leak) {
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
  if (options.source === "excel" || options.source === "sync")
    return hasChanges;
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

    // The exported monitoring sheet intentionally shows a calendar date.
    // Match that row back to the original record even though its exact time,
    // internal id and round id are not represented in Excel.
    if (
      existingIndex == null &&
      options.source === "excel" &&
      arrayKey === "monitoringRecords"
    ) {
      existingIndex = merged.findIndex(
        (current) =>
          Number(current?.roundNumber) === Number(record?.roundNumber) &&
          comparableExcelDate(current?.date) ===
            comparableExcelDate(record?.date) &&
          String(current?.result ?? "") === String(record?.result ?? ""),
      );
      if (existingIndex < 0) existingIndex = undefined;
    }

    if (existingIndex == null) {
      indexByIdentity.set(identity, merged.length);
      merged.push(record);
      return;
    }

    const current = merged[existingIndex];
    if (parseTime(record?.date) >= parseTime(current?.date)) {
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

function mergeSyncLeakFields(existingLeak, incomingLeak) {
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
      { source: "sync" },
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
function mergeFreshLeakFields(existingLeak, incomingLeak, options = {}) {
  if (options.source === "sync") {
    return mergeSyncLeakFields(existingLeak, incomingLeak);
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

  const merged = mergePhotoFields(existingLeak, next);

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
    const identity = getLeakIdentity(leak);
    if (identity) indexByIdentity.set(identity, index);
  });

  for (const leak of incoming) {
    const identity = getLeakIdentity(leak);
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
          addHistory: options.source !== "sync",
          source: options.source,
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
    const identity = getLeakIdentity(leak);
    if (identity) existingByIdentity.set(identity, leak);
  }

  for (const leak of incoming) {
    const identity = getLeakIdentity(leak);
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
    const identity = getLeakIdentity(leak);
    if (identity) existingByIdentity.set(identity, leak);
  }

  return incoming.filter((leak) => {
    const identity = getLeakIdentity(leak);
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

async function parseZipMeta(zip) {
  const metaFile = zip.file("project.json");
  if (!metaFile) return null;

  try {
    const parsedMeta = JSON.parse(await metaFile.async("string"));
    const metaValidation = validateProjectBackupMeta(parsedMeta);
    if (metaValidation.ok) return normalizeProjectMeta(metaValidation.data);
    if (parsedMeta?.project?.name && parsedMeta?.project?.type) {
      return normalizeProjectMeta(parsedMeta);
    }
  } catch {
    // ignore invalid project meta
  }

  return null;
}

async function parseBackupZip(zipFile) {
  assertImportFileSize(zipFile);
  const JSZip = (await getJSZip()).default;
  const zip = await JSZip.loadAsync(zipFile);
  assertArchiveLimits(zip);

  const jsonFile = zip.file("backup.json");
  if (!jsonFile) throw new Error("Файл backup.json не найден в архиве");

  let parsed;
  try {
    parsed = JSON.parse(await jsonFile.async("string"));
  } catch {
    throw new Error("backup.json содержит невалидный JSON");
  }

  return {
    zip,
    leaks: parseBackupValidation(parsed),
    meta: await parseZipMeta(zip),
  };
}

async function restorePhotosFromZip(leaks, zip, savePhotoRefOrFn) {
  const savePhoto =
    typeof savePhotoRefOrFn === "function"
      ? savePhotoRefOrFn
      : savePhotoRefOrFn?.current;

  return mapWithConcurrency(leaks, IMPORT_CONCURRENCY, async (leak) => {
    const copy = { ...leak };
    const baseKey = String(leak.leak_id ?? leak.id);
    const savedPaths = {};

    for (const key of PHOTO_KEYS) {
      const path = leak[key];
      if (!path) continue;

      let blob = null;
      let fallbackPath = path;

      if (path.startsWith("zip:")) {
        const relativePath = path.replace("zip:", "");
        const photoFile = zip.file(relativePath);
        if (!photoFile) continue;

        const base64 = await photoFile.async("base64");
        const ext = relativePath.split(".").pop() || "jpg";
        const mime = ext === "png" ? "image/png" : "image/jpeg";

        const byteChars = atob(base64);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArr[i] = byteChars.charCodeAt(i);
        }
        blob = new Blob([byteArr], { type: mime });
        fallbackPath = `data:${mime};base64,${base64}`;
      } else if (path.startsWith("data:image/")) {
        blob = dataUrlToBlob(path);
      }

      if (!blob) continue;

      const storageKey =
        key === "photo_after"
          ? `${baseKey}_after`
          : key === "photo_repair"
            ? `${baseKey}_repair`
            : baseKey;
      const excludePaths = Object.values(savedPaths);
      const newPath = await savePhoto(blob, storageKey, excludePaths, {
        cleanupOldVersions: false,
      });
      copy[key] = newPath ?? fallbackPath;
      if (newPath) savedPaths[key] = newPath;
    }

    if (Array.isArray(copy.monitoringRecords)) {
      const restoredRecords = [];
      for (const [index, record] of copy.monitoringRecords.entries()) {
        const path = record?.[MONITORING_PHOTO_KEY];
        if (!path) {
          restoredRecords.push(record);
          continue;
        }

        let blob = null;
        let fallbackPath = path;

        if (path.startsWith("zip:")) {
          const relativePath = path.replace("zip:", "");
          const photoFile = zip.file(relativePath);
          if (!photoFile) {
            restoredRecords.push(record);
            continue;
          }

          const base64 = await photoFile.async("base64");
          const ext = relativePath.split(".").pop() || "jpg";
          const mime = ext === "png" ? "image/png" : "image/jpeg";
          const byteChars = atob(base64);
          const byteArr = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteArr[i] = byteChars.charCodeAt(i);
          }
          blob = new Blob([byteArr], { type: mime });
          fallbackPath = `data:${mime};base64,${base64}`;
        } else if (path.startsWith("data:image/")) {
          blob = dataUrlToBlob(path);
        }

        if (!blob) {
          restoredRecords.push(record);
          continue;
        }

        const recordId = String(record.id ?? index + 1);
        const storageKey = `${baseKey}_monitoring_${recordId}`;
        const newPath = await savePhoto(
          blob,
          storageKey,
          [...Object.values(savedPaths)],
          { cleanupOldVersions: false },
        );
        restoredRecords.push({
          ...record,
          [MONITORING_PHOTO_KEY]: newPath ?? fallbackPath,
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
  return zip.generateAsync({ type: "blob" });
}

export async function buildProjectBackupZip({ leaks, idbGet, project, vars }) {
  const JSZip = (await getJSZip()).default;
  const zip = new JSZip();

  const exportedLeaks = await exportLeaksWithPhotos(leaks, zip, idbGet);
  await yieldToMainThread();
  zip.file("backup.json", JSON.stringify(exportedLeaks, null, 2));

  const meta = buildProjectMeta({
    project,
    vars,
    settings: readProjectSettings(project?.id),
    monitoringRound: readMonitoringRound(project?.id),
    syncState: await readProjectSyncStateAsync(project?.id),
  });
  if (meta) zip.file("project.json", JSON.stringify(meta, null, 2));

  await yieldToMainThread();
  return zip.generateAsync({ type: "blob" });
}

export async function exportBackupZip(leaks, idbGet, projectName = "backup") {
  const blob = await buildBackupZip(leaks, idbGet);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export function detectProjectTypeFromLeaks(leaks) {
  if (!leaks?.length) return null;

  const keys = new Set(leaks.slice(0, 20).flatMap(Object.keys));
  for (const [type, fields] of Object.entries(TYPE_SIGNATURES)) {
    if (fields.some((fieldName) => keys.has(fieldName))) return type;
  }

  return null;
}

export async function peekBackupZip(zipFile) {
  const { leaks, meta } = await parseBackupZip(zipFile);

  return {
    leaks,
    meta,
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
  } = ctx;

  const { zip, leaks, meta } = await parseBackupZip(zipFile);

  const projectName =
    ctx.overrideName?.trim() || meta?.project?.name || metaFallback?.name;
  const projectType = meta?.project?.type || metaFallback?.type;

  if (!projectName || !projectType) {
    throw new Error(
      "Архив не содержит метаданных проекта. Заполните название и тип проекта.",
    );
  }

  const newProject = meta?.project?.syncId
    ? addProject(projectName, projectType, {
        syncId: meta.project.syncId,
      })
    : addProject(projectName, projectType);
  if (!newProject) throw new Error("Не удалось создать проект");

  try {
    await waitForProjectActivation(activeProjectIdRef, newProject.id);
    await waitForPhotoStorage(photoReadyRef);

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

    const restoredLeaks = await restorePhotosFromZip(leaks, zip, savePhotoRef);
    const finalLeaks = recalculateLeaks(restoredLeaks, meta?.vars);
    saveMonitoringRound(
      newProject.id,
      getRestoredMonitoringRound(meta, finalLeaks),
    );
    await saveRef.current(finalLeaks);

    await writeProjectSyncState(newProject.id, meta?.sync, finalLeaks);
    return { project: importedProject, leakCount: finalLeaks.length };
  } catch (error) {
    await rollbackImportedProject(newProject, removeProject);
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
  } = ctx;

  const { id: existingProjectId, folderName: existingFolderName } =
    existingProject;
  const { zip, leaks, meta } = await parseBackupZip(zipFile);

  const isSync = mode === "sync";
  const isMerge = mode === "merge" || isSync;
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
  if (shouldAdoptSyncId && typeof setProjectSyncId !== "function") {
    throw new Error("Не удалось сохранить идентификатор синхронизации");
  }

  const localSyncState = await readProjectSyncStateAsync(existingProjectId);
  const incomingSyncState = meta?.sync;
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
  });

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

  if (isMerge) {
    const incomingToApply = filterIncomingLeaksForMerge(
      existing,
      isSync ? applyProjectTombstones(leaks, mergedSyncState) : leaks,
      isSync ? { source: "sync" } : undefined,
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
      isSync ? { source: "sync" } : undefined,
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

  try {
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

    if (activeProjectIdRef.current === existingProjectId) {
      await saveRef.current(finalLeaks);
    } else {
      await LeakRepository.saveAll(finalLeaks, {
        projectId: existingProjectId,
        folderName: existingFolderName,
      });
    }
  } catch (error) {
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
    await writeProjectSyncState(existingProjectId, localSyncState, existing);

    await PhotoRepository.gcOrphaned(existing, {
      projectId: existingProjectId,
      folderName: existingFolderName,
    }).catch(() => {});
    throw error;
  }

  // Data is committed. Cleanup failure must not turn a successful import into
  // a false "Import error"; orphan cleanup can be retried later.
  await PhotoRepository.gcOrphaned(finalLeaks, {
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
  const syncedProject = shouldAdoptSyncId
    ? setProjectSyncId(existingProjectId, incomingSyncId)
    : existingProject;
  if (!syncedProject) {
    throw new Error("Не удалось сохранить идентификатор синхронизации");
  }

  return { project: syncedProject, leakCount: addedCount };
}

export async function importBackupZip(zipFile, savePhoto) {
  const { zip, leaks, meta } = await parseBackupZip(zipFile);
  const restoredLeaks = await restorePhotosFromZip(leaks, zip, savePhoto);
  return { leaks: recalculateLeaks(restoredLeaks, meta?.vars), meta };
}
