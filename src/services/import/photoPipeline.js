import { getPhotoSrc } from "@/hooks/photoService";
import { fingerprintBlob } from "@/utils/blobHash";
import { getLeakMergeIdentity } from "@/services/projectSyncState";
import { getImageMimeTypeFromExtension } from "@/services/archivePaths";
import { mapWithConcurrency } from "@/services/projectBackup/runtime";
import {
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";

const PHOTO_KEYS = new Set(LEAK_PHOTO_FIELDS);

const DEFAULT_PHOTO_RECONCILE_CONCURRENCY = 3;
const DEFAULT_REUSABLE_PHOTO_CONCURRENCY = 3;
// Kept equal to the constants above on purpose: this value is not yet backed
// by a measurement, so hydrating ZIP photos concurrently should not silently
// introduce a different, equally unmeasured number. Tune all of them together
// once performance/large-dataset.perf.spec.js has been run at 3 / 5 / 8.
const DEFAULT_ZIP_HYDRATE_CONCURRENCY = 3;

export function isZipFile(file) {
  return (
    /\.zip$/i.test(file?.name ?? "") || String(file?.type ?? "").includes("zip")
  );
}

function getMimeFromPath(path) {
  const extension = String(path).split(".").pop();
  return getImageMimeTypeFromExtension(extension);
}

async function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl ?? "").match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: match[1] });
}

function getLeakIdentity(leak) {
  const leakTag = String(leak?.leak_id ?? "").trim();
  if (leakTag) return `tag:${leakTag}`;
  return getLeakMergeIdentity(leak);
}

function normalizeRecordDateIdentity(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return String(value.getTime());
  }

  const text = String(value).trim();
  const dotted = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dotted) {
    const year = dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3];
    return `${year}-${Number(dotted[2])}-${Number(dotted[1])}`;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? String(parsed) : text;
}

function getMonitoringIdentity(record, index) {
  if (record?.date) {
    return `date:${normalizeRecordDateIdentity(record.date)}|result:${String(record?.result ?? "")}`;
  }
  if (record?.id != null) return `id:${String(record.id)}`;
  return `index:${index}`;
}

async function resolveStoredPhotoBlob(path, getStoredPhoto) {
  if (!path) return null;
  if (path instanceof Blob) return path;
  if (String(path).startsWith("data:image/")) return dataUrlToBlob(path);

  if (String(path).startsWith("idb://")) {
    if (typeof getStoredPhoto !== "function") return null;
    const stored = await getStoredPhoto(String(path).replace("idb://", ""));
    if (stored instanceof Blob) return stored;
    if (String(stored ?? "").startsWith("data:image/")) {
      return dataUrlToBlob(stored);
    }
    return null;
  }

  const src = await getPhotoSrc(String(path));
  return String(src ?? "").startsWith("data:image/")
    ? dataUrlToBlob(src)
    : null;
}

// Content equality via the same fingerprint the reuse map is keyed by, so a
// photo is hashed at most once per import (getPhotoFingerprint memoizes on
// blob identity) instead of being fully re-read and compared byte by byte in
// a JS loop. Sizes are checked first because that rules out most mismatches
// without reading the stored blob at all.
async function blobsEqual(left, right, incomingFingerprint, fingerprintCache) {
  if (!(left instanceof Blob) || !(right instanceof Blob)) return false;
  if (left.size !== right.size) return false;
  if (!incomingFingerprint) return false;

  const existingFingerprint = await getPhotoFingerprint(
    right,
    fingerprintCache,
  );
  return (
    Boolean(existingFingerprint) && existingFingerprint === incomingFingerprint
  );
}

async function buildReusablePhotoMap(
  existingLeaks,
  getStoredPhoto,
  concurrency = DEFAULT_REUSABLE_PHOTO_CONCURRENCY,
) {
  const paths = new Set();
  for (const leak of existingLeaks ?? []) {
    for (const key of PHOTO_KEYS) {
      if (leak?.[key]) paths.add(leak[key]);
    }
    for (const record of leak?.monitoringRecords ?? []) {
      for (const field of MONITORING_PHOTO_FIELDS) {
        if (record?.[field]) paths.add(record[field]);
      }
    }
  }

  const reusable = new Map();
  await mapWithConcurrency([...paths], concurrency, async (path) => {
    try {
      const blob = await resolveStoredPhotoBlob(path, getStoredPhoto);
      const fingerprint = await fingerprintBlob(blob);
      if (fingerprint && !reusable.has(fingerprint)) {
        reusable.set(fingerprint, path);
      }
    } catch {
      // Unreadable paths remain eligible for normal slot comparison.
    }
  });
  return reusable;
}

async function reconcilePhotoValue(
  incomingPath,
  existingPath,
  getStoredPhoto,
  stats,
  field,
  reusablePhotos,
  preserveExisting,
  fingerprintCache,
) {
  const incomingIsBlob = incomingPath instanceof Blob;
  const incomingIsDataUrl = String(incomingPath ?? "").startsWith(
    "data:image/",
  );
  if (!incomingIsBlob && !incomingIsDataUrl) return incomingPath;

  if (preserveExisting && existingPath) {
    stats.reused += 1;
    return existingPath;
  }

  try {
    const incomingBlob = incomingIsBlob
      ? incomingPath
      : await dataUrlToBlob(incomingPath);
    const fingerprint = await getPhotoFingerprint(
      incomingBlob,
      fingerprintCache,
    );
    const reusablePath = fingerprint ? reusablePhotos.get(fingerprint) : null;
    if (reusablePath) {
      stats.reused += 1;
      return reusablePath;
    }

    if (!existingPath) {
      stats.added += 1;
      stats.addedByField[field] = (stats.addedByField[field] ?? 0) + 1;
      return incomingPath;
    }

    const existingBlob = await resolveStoredPhotoBlob(
      existingPath,
      getStoredPhoto,
    );
    if (
      await blobsEqual(
        incomingBlob,
        existingBlob,
        fingerprint,
        fingerprintCache,
      )
    ) {
      stats.reused += 1;
      return existingPath;
    }
    const reason = existingBlob ? "different" : "unreadable";
    stats.replacedByReason[reason] = (stats.replacedByReason[reason] ?? 0) + 1;
  } catch {
    stats.replacedByReason.unreadable =
      (stats.replacedByReason.unreadable ?? 0) + 1;
  }

  stats.replaced += 1;
  stats.replacedByField[field] = (stats.replacedByField[field] ?? 0) + 1;
  return incomingPath;
}

export async function reconcileExcelImportPhotos(
  existingLeaks,
  incomingLeaks,
  getStoredPhoto,
  options = {},
) {
  const existingByIdentity = new Map();
  const stats = {
    added: 0,
    reused: 0,
    replaced: 0,
    addedByField: {},
    replacedByField: {},
    replacedByReason: {},
  };

  for (const leak of existingLeaks ?? []) {
    const identity = getLeakIdentity(leak);
    if (identity) existingByIdentity.set(identity, leak);
  }
  const preserveExisting = options.preserveExisting === true;
  const concurrency =
    options.concurrency ?? DEFAULT_PHOTO_RECONCILE_CONCURRENCY;
  const reusablePhotoConcurrency =
    options.reusablePhotoConcurrency ??
    Math.min(concurrency, DEFAULT_REUSABLE_PHOTO_CONCURRENCY);
  const reusablePhotos = preserveExisting
    ? new Map()
    : await buildReusablePhotoMap(
        existingLeaks,
        getStoredPhoto,
        reusablePhotoConcurrency,
      );
  const fingerprintCache = new WeakMap();

  const leaks = await mapWithConcurrency(
    incomingLeaks ?? [],
    concurrency,
    async (leak) => {
      const current = existingByIdentity.get(getLeakIdentity(leak));
      const copy = { ...leak };

      for (const key of PHOTO_KEYS) {
        copy[key] = await reconcilePhotoValue(
          leak[key],
          current?.[key],
          getStoredPhoto,
          stats,
          key,
          reusablePhotos,
          preserveExisting,
          fingerprintCache,
        );
      }

      if (Array.isArray(leak.monitoringRecords)) {
        const currentMonitoringRecords = current?.monitoringRecords ?? [];
        const currentRecords = new Map(
          currentMonitoringRecords.map((record, index) => [
            getMonitoringIdentity(record, index),
            record,
          ]),
        );
        copy.monitoringRecords = [];
        for (const [index, record] of leak.monitoringRecords.entries()) {
          const recordAtSamePosition = currentMonitoringRecords[index];
          const currentRecord =
            preserveExisting &&
            currentMonitoringRecords.length === leak.monitoringRecords.length
              ? recordAtSamePosition
              : (currentRecords.get(getMonitoringIdentity(record, index)) ??
                recordAtSamePosition);
          const recordCopy = { ...record };
          for (const field of MONITORING_PHOTO_FIELDS) {
            recordCopy[field] = await reconcilePhotoValue(
              record?.[field],
              currentRecord?.[field],
              getStoredPhoto,
              stats,
              `monitoring.${field}`,
              reusablePhotos,
              preserveExisting,
              fingerprintCache,
            );
          }
          copy.monitoringRecords.push(recordCopy);
        }
      }

      return copy;
    },
  );

  return {
    leaks,
    photos: {
      ...stats,
      toSave: stats.added + stats.replaced,
      total: stats.added + stats.reused + stats.replaced,
    },
  };
}

async function zipPhotoToBlob(zip, path) {
  const relativePath = path.replace(/^zip:/, "");
  const file = zip.file(relativePath);
  if (!file) return null;
  const blob = await file.async("blob");
  const mime = getMimeFromPath(relativePath);
  return blob.type === mime ? blob : new Blob([blob], { type: mime });
}

export async function hydrateZipPhotos(
  result,
  zip,
  concurrency = DEFAULT_ZIP_HYDRATE_CONCURRENCY,
) {
  let restoredPhotos = 0;
  let missingPhotos = 0;
  let photoReferences = 0;
  const photoCache = new Map();
  const readPhoto = (path) => {
    const key = String(path).replace(/^zip:/, "");
    if (!photoCache.has(key)) {
      photoCache.set(key, zipPhotoToBlob(zip, `zip:${key}`));
    }
    return photoCache.get(key);
  };

  // Decompressing a photo out of the ZIP is the slow part here, and each one
  // is independent, so leaks are hydrated with the same bounded concurrency
  // the rest of the photo pipeline uses. mapWithConcurrency writes results by
  // index, so leak order is preserved; readPhoto memoizes its promise per
  // entry, so a shared photo is still only decompressed once.
  const leaks = await mapWithConcurrency(
    result.leaks,
    concurrency,
    async (leak) => {
      const copy = { ...leak };

      for (const key of PHOTO_KEYS) {
        if (!String(copy[key] ?? "").startsWith("zip:")) continue;
        photoReferences += 1;
        const photoBlob = await readPhoto(copy[key]);
        if (photoBlob) {
          copy[key] = photoBlob;
          restoredPhotos += 1;
        } else {
          delete copy[key];
          missingPhotos += 1;
        }
      }

      if (Array.isArray(copy.monitoringRecords)) {
        copy.monitoringRecords = [];
        for (const record of leak.monitoringRecords) {
          const recordCopy = { ...record };
          for (const field of MONITORING_PHOTO_FIELDS) {
            if (!String(record?.[field] ?? "").startsWith("zip:")) continue;
            photoReferences += 1;
            const photoBlob = await readPhoto(record[field]);
            if (!photoBlob) {
              delete recordCopy[field];
              missingPhotos += 1;
              continue;
            }
            restoredPhotos += 1;
            recordCopy[field] = photoBlob;
          }
          copy.monitoringRecords.push(recordCopy);
        }
      }

      return copy;
    },
  );

  return {
    ...result,
    leaks,
    stats: {
      ...result.stats,
      restoredPhotos,
      missingPhotos,
      uniquePhotoEntriesRead: photoCache.size,
      photoReferences,
    },
  };
}

const DEFAULT_PHOTO_PERSIST_CONCURRENCY = 3;

async function getPhotoFingerprint(blob, fingerprintCache) {
  if (!fingerprintCache.has(blob)) {
    fingerprintCache.set(blob, fingerprintBlob(blob));
  }
  return fingerprintCache.get(blob);
}

async function persistPhotoValue(
  value,
  savePhoto,
  storageKey,
  excludePaths = [],
  fingerprintCache = new WeakMap(),
) {
  const isBlob = value instanceof Blob;
  const isDataUrl = String(value ?? "").startsWith("data:image/");
  if (!isBlob && !isDataUrl) return value;
  const blob = isBlob ? value : await dataUrlToBlob(value);
  if (!(blob instanceof Blob)) return value;
  const contentHash = await getPhotoFingerprint(blob, fingerprintCache);
  const saved = await savePhoto(blob, storageKey, excludePaths, {
    cleanupOldVersions: false,
    contentHash,
    returnMetadata: true,
  });
  const result =
    typeof saved === "string" ? { path: saved, created: true } : saved;
  if (!result?.path) {
    throw new Error(`Failed to persist imported photo (${storageKey})`);
  }
  return result;
}

async function persistLeakPhotos(
  leak,
  savePhoto,
  createdPaths,
  fingerprintCache,
) {
  const copy = { ...leak };
  const baseKey = String(leak.leak_id ?? leak.id);
  const savedPaths = [];

  for (const key of PHOTO_KEYS) {
    const suffix =
      key === "photo_after"
        ? "_after"
        : key === "photo_repair"
          ? "_repair"
          : "";
    const result = await persistPhotoValue(
      copy[key],
      savePhoto,
      `${baseKey}${suffix}`,
      [...savedPaths],
      fingerprintCache,
    );
    copy[key] = result?.path ?? result;
    if (result?.created) createdPaths.push(result.path);
    if (copy[key] && copy[key] !== leak[key]) savedPaths.push(copy[key]);
  }

  if (Array.isArray(copy.monitoringRecords)) {
    copy.monitoringRecords = [];
    for (const [index, record] of leak.monitoringRecords.entries()) {
      const recordCopy = { ...record };
      for (const field of MONITORING_PHOTO_FIELDS) {
        const suffix = field === "photo" ? "" : `_${field}`;
        const result = await persistPhotoValue(
          record?.[field],
          savePhoto,
          `${baseKey}_monitoring_${record.id ?? index + 1}${suffix}`,
          [...savedPaths],
          fingerprintCache,
        );
        if (result?.created) createdPaths.push(result.path);
        recordCopy[field] = result?.path ?? result;
        if (recordCopy[field] && recordCopy[field] !== record?.[field]) {
          savedPaths.push(recordCopy[field]);
        }
      }
      copy.monitoringRecords.push(recordCopy);
    }
  }

  return copy;
}

export async function persistExcelImportPhotos(
  leaks,
  savePhoto,
  {
    returnTransaction = false,
    concurrency = DEFAULT_PHOTO_PERSIST_CONCURRENCY,
  } = {},
) {
  if (typeof savePhoto !== "function") {
    return returnTransaction ? { leaks, createdPaths: [] } : leaks;
  }

  const createdPaths = [];
  const fingerprintCache = new WeakMap();

  let persistedLeaks;
  try {
    persistedLeaks = await mapWithConcurrency(leaks, concurrency, (leak) =>
      persistLeakPhotos(leak, savePhoto, createdPaths, fingerprintCache),
    );
  } catch (error) {
    error.createdPhotoPaths = [...createdPaths];
    throw error;
  }
  return returnTransaction
    ? { leaks: persistedLeaks, createdPaths }
    : persistedLeaks;
}

export async function rollbackExcelImportPhotos(
  paths,
  deletePhoto,
  { concurrency = DEFAULT_PHOTO_PERSIST_CONCURRENCY } = {},
) {
  if (typeof deletePhoto !== "function") return;
  await mapWithConcurrency([...new Set(paths)], concurrency, async (path) => {
    try {
      await deletePhoto(path);
    } catch {
      // Rollback remains best-effort, but native deletions stay bounded.
    }
  });
}
