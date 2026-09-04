import { mapWithConcurrency } from "@/services/backup/runtime";
import {
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";
import { asError } from "@/utils/appError";
import { dataUrlToBlob, getPhotoFingerprint } from "./photoBlobs";

// Замерено на устройстве, как и у сверки: весь выигрыш — шаг с одного на два.
const DEFAULT_PHOTO_PERSIST_CONCURRENCY = 2;

const PHOTO_KEYS = new Set(LEAK_PHOTO_FIELDS);

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
