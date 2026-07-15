import { isNative } from "@/utils/platform";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { logger } from "@/utils/logger";

const VALID_STATUSES = new Set(["open", "in_progress", "resolved"]);
const WEB_DATA_DB = "LeakTrackingDataDB";
const WEB_DATA_STORE = "projects";
const WEB_DATA_VERSION = 1;

let webDataDbPromise = null;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeOptionalNumber(value) {
  if (value == null) return value ?? null;
  return isFiniteNumber(value) ? value : undefined;
}

function isValidPhotoPath(value) {
  return (
    value == null ||
    (typeof value === "string" &&
      (value.startsWith("idb://") ||
        value.startsWith("data://") ||
        value.startsWith("zip:") ||
        value.startsWith("data:image/") ||
        value.startsWith("Documents/")))
  );
}

function normalizeLeakRecord(item) {
  if (!item || typeof item !== "object") return null;
  if (!(typeof item.id === "string" || typeof item.id === "number"))
    return null;

  const lat = normalizeOptionalNumber(item.lat);
  const lng = normalizeOptionalNumber(item.lng);
  if (item.lat != null && lat === undefined) return null;
  if (item.lng != null && lng === undefined) return null;

  const status = item.status ?? "open";
  if (!VALID_STATUSES.has(status)) return null;
  if (
    !isValidPhotoPath(item.photo) ||
    !isValidPhotoPath(item.photo_after) ||
    !isValidPhotoPath(item.photo_repair)
  ) {
    return null;
  }

  return {
    ...item,
    lat,
    lng,
    status,
  };
}

function filterValidLeaks(arr, source) {
  if (!Array.isArray(arr)) return [];
  const valid = [];
  const invalid = [];
  for (const item of arr) {
    const normalized = normalizeLeakRecord(item);
    if (normalized) valid.push(normalized);
    else invalid.push(item?.id ?? "?");
  }
  if (invalid.length) {
    logger.warn(
      `[LeakRepository] ${source}: discarded ${invalid.length} invalid records (id: ${invalid.join(", ")})`,
    );
  }
  return valid;
}

function getMobileRecoveryPaths(folderName) {
  const dir = `LeakReports/${folderName}/data`;
  return {
    main: `${dir}/data.json`,
    backup: `${dir}/data.backup.json`,
    temp: `${dir}/data.tmp.json`,
  };
}

function isMissingFileError(error) {
  const message = String(error?.message ?? error).toLowerCase();
  return message.includes("exist") || message.includes("not found");
}

async function readNativeArray(path) {
  const result = await Filesystem.readFile({
    path,
    directory: Directory.Data,
    encoding: "utf8",
  });
  const parsed = JSON.parse(result.data || "[]");
  if (!Array.isArray(parsed)) throw new Error(`Expected array in ${path}`);
  return parsed;
}

async function writeNativeArray(folderName, leaks) {
  const paths = getMobileRecoveryPaths(folderName);
  const serialized = JSON.stringify(leaks);
  await ensureDir(paths.temp);

  await Filesystem.writeFile({
    path: paths.temp,
    directory: Directory.Data,
    data: serialized,
    encoding: "utf8",
  });

  let hasPreviousData = false;
  try {
    await readNativeArray(paths.main);
    hasPreviousData = true;
  } catch (error) {
    if (!isMissingFileError(error)) {
      logger.warn(
        `[LeakRepository] Current data is invalid; preserving existing recovery copy for "${paths.main}":`,
        error,
      );
    }
  }

  if (hasPreviousData) {
    await Filesystem.deleteFile({
      path: paths.backup,
      directory: Directory.Data,
    }).catch((error) => {
      if (!isMissingFileError(error)) throw error;
    });

    // Native copy avoids sending and serializing the complete previous JSON
    // through the JavaScript bridge a second time.
    await Filesystem.copy({
      from: paths.main,
      to: paths.backup,
      directory: Directory.Data,
    });
  }

  await Filesystem.deleteFile({
    path: paths.main,
    directory: Directory.Data,
  }).catch((error) => {
    if (!isMissingFileError(error)) throw error;
  });

  try {
    await Filesystem.rename({
      from: paths.temp,
      to: paths.main,
      directory: Directory.Data,
    });
  } catch (error) {
    // Keep the project readable even if the final rename fails.
    if (hasPreviousData) {
      await Filesystem.copy({
        from: paths.backup,
        to: paths.main,
        directory: Directory.Data,
      }).catch(() => {});
    }
    throw error;
  }
}

async function ensureDir(filePath) {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  await Filesystem.mkdir({
    path: dir,
    directory: Directory.Data,
    recursive: true,
  }).catch(() => {});
}

function openWebDataDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (webDataDbPromise) return webDataDbPromise;

  webDataDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(WEB_DATA_DB, WEB_DATA_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(WEB_DATA_STORE)) {
        db.createObjectStore(WEB_DATA_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => {
        webDataDbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      webDataDbPromise = null;
      reject(request.error);
    };
  });

  return webDataDbPromise;
}

async function readWebData(projectId) {
  const db = await openWebDataDb();
  if (!db || !projectId) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_DATA_STORE, "readonly");
    const store = tx.objectStore(WEB_DATA_STORE);
    const request = store.get(projectId);
    request.onsuccess = () => resolve(request.result?.data ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeWebData(projectId, leaks) {
  const db = await openWebDataDb();
  if (!db || !projectId) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_DATA_STORE, "readwrite");
    const store = tx.objectStore(WEB_DATA_STORE);
    const request = store.put({
      id: projectId,
      data: leaks,
      timestamp: Date.now(),
    });
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function deleteWebData(projectId) {
  const db = await openWebDataDb();
  if (!db || !projectId) return;

  await new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_DATA_STORE, "readwrite");
    const store = tx.objectStore(WEB_DATA_STORE);
    const request = store.delete(projectId);
    request.onerror = () => reject(request.error);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function saveWebDataToLocalStorage(projectId, leaks) {
  const key = STORAGE_KEYS.PROJECT_DATA(projectId);
  try {
    localStorage.setItem(key, JSON.stringify(leaks));
  } catch (error) {
    localStorage.removeItem(key);
    logger.warn(
      `[LeakRepository] localStorage quota exceeded for "${key}", using IndexedDB only:`,
      error,
    );
  }
}

export const LeakRepository = {
  async getAll({ projectId, folderName }) {
    if (isNative) {
      const { main, backup } = getMobileRecoveryPaths(folderName);
      try {
        return filterValidLeaks(await readNativeArray(main), main);
      } catch (mainError) {
        try {
          const recovered = await readNativeArray(backup);
          logger.warn(
            `[LeakRepository] Recovered project data from "${backup}" after failing to read "${main}".`,
            mainError,
          );
          return filterValidLeaks(recovered, backup);
        } catch (backupError) {
          if (
            !isMissingFileError(mainError) ||
            !isMissingFileError(backupError)
          ) {
            logger.error(
              `[LeakRepository] Failed to read both "${main}" and "${backup}":`,
              mainError,
              backupError,
            );
          }
          return [];
        }
      }
    }

    const key = STORAGE_KEYS.PROJECT_DATA(projectId);

    try {
      const indexedData = await readWebData(projectId);
      if (Array.isArray(indexedData)) {
        return filterValidLeaks(indexedData, `IndexedDB[${projectId}]`);
      }
    } catch (err) {
      logger.error("[LeakRepository] Failed to read IndexedDB:", err);
    }

    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        await writeWebData(projectId, parsed).catch((error) => {
          logger.warn(
            "[LeakRepository] Failed to migrate to IndexedDB:",
            error,
          );
        });
      }
      return filterValidLeaks(parsed, `localStorage[${key}]`);
    } catch (err) {
      logger.error("[LeakRepository] Corrupted localStorage:", err);
      return [];
    }
  },

  async saveAll(leaks, { projectId, folderName }) {
    if (isNative) {
      await writeNativeArray(folderName, leaks);
      return;
    }
    await writeWebData(projectId, leaks);
    saveWebDataToLocalStorage(projectId, leaks);
  },

  async clear({ projectId, folderName }) {
    if (isNative) {
      await writeNativeArray(folderName, []);
      return;
    }
    await deleteWebData(projectId);
    localStorage.removeItem(STORAGE_KEYS.PROJECT_DATA(projectId));
  },
};
