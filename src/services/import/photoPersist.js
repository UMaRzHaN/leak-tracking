import { mapWithConcurrency } from "@/services/backup/runtime";
import {
  EVENT_PHOTO_FIELDS,
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
  // Один снимок — один файл. Разбор архива отдаёт общий снимок одним и тем же
  // Blob, а осмотр ссылается на тот же файл, что и его запись обхода; второе
  // сохранение развело бы их по разным копиям. Так же поступает и
  // восстановление архива-бэкапа.
  const persistedByValue = new Map();

  const persist = async (value, storageKey) => {
    const known = persistedByValue.get(value);
    if (known) return known;
    const result = await persistPhotoValue(
      value,
      savePhoto,
      storageKey,
      [...savedPaths],
      fingerprintCache,
    );
    if (result?.created) createdPaths.push(result.path);
    const path = result?.path ?? result;
    if (path && path !== value) {
      savedPaths.push(path);
      persistedByValue.set(value, path);
    }
    return path;
  };

  const persistRecords = async (records, kind, fields) => {
    const persisted = [];
    for (const [index, record] of records.entries()) {
      const recordCopy = { ...record };
      for (const field of fields) {
        const suffix = field === "photo" ? "" : `_${field}`;
        recordCopy[field] = await persist(
          record?.[field],
          `${baseKey}_${kind}_${record?.id ?? index + 1}${suffix}`,
        );
      }
      persisted.push(recordCopy);
    }
    return persisted;
  };

  for (const key of PHOTO_KEYS) {
    const suffix =
      key === "photo_after"
        ? "_after"
        : key === "photo_repair"
          ? "_repair"
          : "";
    copy[key] = await persist(leak[key], `${baseKey}${suffix}`);
  }

  if (Array.isArray(copy.monitoringRecords)) {
    copy.monitoringRecords = await persistRecords(
      leak.monitoringRecords,
      "monitoring",
      MONITORING_PHOTO_FIELDS,
    );
  }

  // Лента наравне с записями обхода. Без этого прохода снимок события
  // оставался самим Blob: запись сохранялась с ним вместо пути, и экран падал
  // на `path.startsWith`, а на телефоне Blob в JSON превращался в `{}`.
  if (Array.isArray(copy.events)) {
    copy.events = await persistRecords(
      leak.events,
      "event",
      EVENT_PHOTO_FIELDS,
    );
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
