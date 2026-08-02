import { getPhotoSrc } from "@/hooks/photoService";
import { fingerprintBlob } from "@/utils/blobHash";
import { getLeakMergeIdentity } from "@/services/projectSyncState";
import { getImageMimeTypeFromExtension } from "@/services/archivePaths";

const PHOTO_KEYS = new Set(["photo", "photo_repair", "photo_after"]);

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

function readBlobBytes(blob) {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

async function blobsEqual(left, right) {
  if (!(left instanceof Blob) || !(right instanceof Blob)) return false;
  if (left.size !== right.size) return false;

  const [leftBytes, rightBytes] = await Promise.all([
    readBlobBytes(left),
    readBlobBytes(right),
  ]);
  const a = new Uint8Array(leftBytes);
  const b = new Uint8Array(rightBytes);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

async function buildReusablePhotoMap(existingLeaks, getStoredPhoto) {
  const paths = new Set();
  for (const leak of existingLeaks ?? []) {
    for (const key of PHOTO_KEYS) {
      if (leak?.[key]) paths.add(leak[key]);
    }
    for (const record of leak?.monitoringRecords ?? []) {
      if (record?.photo) paths.add(record.photo);
    }
  }

  const queue = [...paths];
  const reusable = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const path = queue[cursor];
      cursor += 1;
      try {
        const blob = await resolveStoredPhotoBlob(path, getStoredPhoto);
        const fingerprint = await fingerprintBlob(blob);
        if (fingerprint && !reusable.has(fingerprint)) {
          reusable.set(fingerprint, path);
        }
      } catch {
        // Unreadable paths remain eligible for normal slot comparison.
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(8, queue.length) }, () => worker()),
  );
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
    const fingerprint = await fingerprintBlob(incomingBlob);
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
    if (await blobsEqual(incomingBlob, existingBlob)) {
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
  const reusablePhotos = preserveExisting
    ? new Map()
    : await buildReusablePhotoMap(existingLeaks, getStoredPhoto);

  const leaks = await Promise.all(
    (incomingLeaks ?? []).map(async (leak) => {
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
        copy.monitoringRecords = await Promise.all(
          leak.monitoringRecords.map(async (record, index) => {
            const recordAtSamePosition = currentMonitoringRecords[index];
            const currentRecord =
              preserveExisting &&
              currentMonitoringRecords.length === leak.monitoringRecords.length
                ? recordAtSamePosition
                : (currentRecords.get(getMonitoringIdentity(record, index)) ??
                  recordAtSamePosition);
            return {
              ...record,
              photo: await reconcilePhotoValue(
                record?.photo,
                currentRecord?.photo,
                getStoredPhoto,
                stats,
                "monitoring.photo",
                reusablePhotos,
                preserveExisting,
              ),
            };
          }),
        );
      }

      return copy;
    }),
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

export async function hydrateZipPhotos(result, zip) {
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
  const leaks = [];

  for (const leak of result.leaks) {
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
        if (!String(record?.photo ?? "").startsWith("zip:")) {
          copy.monitoringRecords.push(record);
          continue;
        }
        photoReferences += 1;
        const photoBlob = await readPhoto(record.photo);
        if (!photoBlob) {
          const sanitizedRecord = { ...record };
          delete sanitizedRecord.photo;
          missingPhotos += 1;
          copy.monitoringRecords.push(sanitizedRecord);
          continue;
        }
        restoredPhotos += 1;
        copy.monitoringRecords.push({ ...record, photo: photoBlob });
      }
    }

    leaks.push(copy);
  }

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

async function persistPhotoValue(
  value,
  savePhoto,
  storageKey,
  excludePaths = [],
) {
  const isBlob = value instanceof Blob;
  const isDataUrl = String(value ?? "").startsWith("data:image/");
  if (!isBlob && !isDataUrl) return value;
  const blob = isBlob ? value : await dataUrlToBlob(value);
  if (!(blob instanceof Blob)) return value;
  const contentHash = await fingerprintBlob(blob);
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

export async function persistExcelImportPhotos(
  leaks,
  savePhoto,
  { returnTransaction = false } = {},
) {
  if (typeof savePhoto !== "function") {
    return returnTransaction ? { leaks, createdPaths: [] } : leaks;
  }

  const createdPaths = [];

  const persistedLeaks = [];
  try {
    for (const leak of leaks) {
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
        );
        copy[key] = result?.path ?? result;
        if (result?.created) createdPaths.push(result.path);
        if (copy[key] && copy[key] !== leak[key]) savedPaths.push(copy[key]);
      }

      if (Array.isArray(copy.monitoringRecords)) {
        copy.monitoringRecords = [];
        for (const [index, record] of leak.monitoringRecords.entries()) {
          const result = await persistPhotoValue(
            record.photo,
            savePhoto,
            `${baseKey}_monitoring_${record.id ?? index + 1}`,
            [...savedPaths],
          );
          if (result?.created) createdPaths.push(result.path);
          copy.monitoringRecords.push({
            ...record,
            photo: result?.path ?? result,
          });
        }
      }

      persistedLeaks.push(copy);
    }
  } catch (error) {
    error.createdPhotoPaths = [...createdPaths];
    throw error;
  }
  return returnTransaction
    ? { leaks: persistedLeaks, createdPaths }
    : persistedLeaks;
}

export async function rollbackExcelImportPhotos(paths, deletePhoto) {
  if (typeof deletePhoto !== "function") return;
  await Promise.allSettled(
    [...new Set(paths)].map((path) => deletePhoto(path)),
  );
}
