import { getPhotoBlob, getPhotoSrc, photoExists } from "@/hooks/photoService";
import { fingerprintBlob } from "@/utils/blobHash";
import { getPhotoPathContentHash } from "@/utils/photoContentHash";
import {
  getLeakIdentity,
  getMonitoringIdentity,
} from "@/services/import/photoIdentity";
import { mapWithConcurrency } from "@/services/backup/runtime";
import { hydrateZipPhotos } from "@/services/import/zipPhotoHydration";
import {
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";
import { asError } from "@/utils/appError";

const PHOTO_KEYS = new Set(LEAK_PHOTO_FIELDS);

// Measured on device, not guessed — see performance/README.md. Reconciling 40
// photos takes 10.7 s at 1 and flattens from 2 onward (8.1 / 8.3 / 8.4 / 8.3 s
// at 2 / 3 / 5 / 8), so the whole win is the step from serial to a pair.
const DEFAULT_PHOTO_RECONCILE_CONCURRENCY = 2;
const DEFAULT_REUSABLE_PHOTO_CONCURRENCY = 2;

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

  const direct = await getPhotoBlob(String(path));
  if (direct) return direct;

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

/**
 * Есть ли по этому пути файл.
 *
 * Имя файла называет отпечаток снимка, но не обещает, что снимок на месте:
 * при слиянии двух баз половина путей ведёт на чужое устройство. Принять такой
 * путь за годный — значит подставить его вместо настоящих байтов и потерять
 * фотографию. Проверка нужна дешёвая: stat не читает содержимое, в отличие от
 * прежнего чтения всего файла через мост.
 */
async function storedPhotoExists(path, getStoredPhoto) {
  const value = String(path ?? "");
  if (!value) return false;
  if (value.startsWith("idb://")) {
    if (typeof getStoredPhoto !== "function") return false;
    try {
      return Boolean(await getStoredPhoto(value.slice("idb://".length)));
    } catch {
      return false;
    }
  }
  try {
    return await photoExists(value);
  } catch {
    return false;
  }
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
  // A content-addressed path already states the fingerprint of the photo it was
  // written from, so the map is built without reading any file back — but the
  // path still has to point at a file that exists here, hence the stat.
  // Camera photos, versioned by timestamp, carry no hash and are still read.
  const unnamed = [];
  const named = [];
  for (const path of paths) {
    const fingerprint = getPhotoPathContentHash(path);
    if (fingerprint) named.push({ path, fingerprint });
    else unnamed.push(path);
  }

  await mapWithConcurrency(
    named,
    concurrency,
    async ({ path, fingerprint }) => {
      if (reusable.has(fingerprint)) return;
      if (!(await storedPhotoExists(path, getStoredPhoto))) return;
      if (!reusable.has(fingerprint)) reusable.set(fingerprint, path);
    },
  );

  await mapWithConcurrency(unnamed, concurrency, async (path) => {
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

  // Слияние не трогает занятый слот — но занят он, только если снимок в нём и
  // правда есть. Путь мог приехать с другого устройства вместе с записью, а
  // файла по нему здесь никогда не было; сохранить такой путь значило бы
  // сохранить ссылку в пустоту, выбросив единственный снимок, который у нас на
  // руках. Дальше по этой же функции проверка уже стоит — здесь её не было.
  if (
    preserveExisting &&
    existingPath &&
    (await storedPhotoExists(existingPath, getStoredPhoto))
  ) {
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

    // The slot holds a content-addressed photo: its name carries the
    // fingerprint of the photo it was written from, which is the same kind of
    // value as `fingerprint` above. Comparing the two settles the slot without
    // reading the stored file — and settles it more truthfully, since a stored
    // file that save() compressed no longer has the bytes it was created from
    // and would compare as different to its own source.
    const existingHash = getPhotoPathContentHash(existingPath);
    if (existingHash && fingerprint) {
      // Совпадение отпечатков говорит, что в слоте тот же снимок, но не что он
      // на месте: путь мог прийти с другого устройства вместе с записью.
      if (
        existingHash === fingerprint &&
        (await storedPhotoExists(existingPath, getStoredPhoto))
      ) {
        stats.reused += 1;
        return existingPath;
      }
      const reason = existingHash === fingerprint ? "unreadable" : "different";
      stats.replacedByReason[reason] =
        (stats.replacedByReason[reason] ?? 0) + 1;
      stats.replaced += 1;
      stats.replacedByField[field] = (stats.replacedByField[field] ?? 0) + 1;
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

// Measured on device, not guessed — see performance/README.md. Persisting 40
// photos takes 72 s serially and ~42 s at 2; 3 was reproducibly slower than 2
// in every sweep order, and 8 produced a >100 ms main-thread stall every time.
const DEFAULT_PHOTO_PERSIST_CONCURRENCY = 2;

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
  } catch (caught) {
    // Список созданных фото едет на самой ошибке: по нему откат импорта их и
    // удаляет. Писать поля можно только объекту — см. `asError`.
    const error = asError(caught);
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

// Re-exported so existing main-thread importers keep one entry point.
export { hydrateZipPhotos };
