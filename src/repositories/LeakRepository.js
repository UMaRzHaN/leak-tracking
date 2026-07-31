import { isNative } from "@/utils/platform";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { PROJECT_META } from "@/configs/projects";
import { logger } from "@/utils/logger";

const VALID_STATUSES = new Set(["open", "in_progress", "resolved"]);
const WEB_DATA_DB = "LeakTrackingDataDB";
const WEB_DATA_STORE = "projects";
const WEB_DATA_VERSION = 1;
const PRESERVED_INVALID_RECORDS = Symbol("preservedInvalidLeakRecords");

let webDataDbPromise = null;

export class ProjectDataReadError extends Error {
  constructor(message, { cause, source } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProjectDataReadError";
    this.code = "PROJECT_DATA_READ_FAILED";
    this.source = source ?? "unknown";
  }
}

export class ProjectDataWriteError extends Error {
  constructor(message, { cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProjectDataWriteError";
    this.code = "PROJECT_DATA_WRITE_FAILED";
  }
}

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
  const preservedInvalid = [];
  const invalid = [];
  const seenIds = new Set();
  for (const item of arr) {
    const normalized = normalizeLeakRecord(item);
    const canonicalId = normalized ? String(normalized.id) : null;
    if (normalized && !seenIds.has(canonicalId)) {
      seenIds.add(canonicalId);
      valid.push(normalized);
    } else {
      invalid.push(item?.id ?? "?");
      preservedInvalid.push(item);
    }
  }
  if (invalid.length) {
    logger.warn(
      `[LeakRepository] ${source}: hid ${invalid.length} invalid records from the UI and preserved them in storage (id: ${invalid.join(", ")})`,
    );
  }
  if (preservedInvalid.length) {
    Object.defineProperty(valid, PRESERVED_INVALID_RECORDS, {
      value: preservedInvalid,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return valid;
}

export function getPreservedInvalidLeakRecords(leaks) {
  const preserved = leaks?.[PRESERVED_INVALID_RECORDS];
  return Array.isArray(preserved) ? preserved : [];
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

async function readNativeArray(path, directory = Directory.Data) {
  const result = await Filesystem.readFile({
    path,
    directory,
    encoding: "utf8",
  });
  const parsed = JSON.parse(result.data || "[]");
  if (!Array.isArray(parsed)) throw new Error(`Expected array in ${path}`);
  return parsed;
}

function getLegacyNativeCandidates(legacyStorageType) {
  if (!PROJECT_META[legacyStorageType]) return [];
  const dataDirectory = `LeakReports/${legacyStorageType}/data`;
  return [
    {
      path: `${dataDirectory}/data.json`,
      directory: Directory.Data,
    },
    {
      path: `${dataDirectory}/${legacyStorageType}.json`,
      directory: Directory.Data,
    },
    {
      path: `${dataDirectory}/data.json`,
      directory: Directory.Documents,
    },
    {
      path: `${dataDirectory}/${legacyStorageType}.json`,
      directory: Directory.Documents,
    },
  ];
}

async function recoverLegacyNativeArray(
  folderName,
  legacyStorageType,
  currentMainPath,
) {
  const candidates = getLegacyNativeCandidates(legacyStorageType);
  for (const candidate of candidates) {
    if (
      candidate.path === currentMainPath &&
      candidate.directory === Directory.Data
    ) {
      continue;
    }

    let legacyData;
    try {
      legacyData = await readNativeArray(candidate.path, candidate.directory);
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw new ProjectDataReadError(
        `Legacy project data could not be read from "${candidate.path}"`,
        { cause: error, source: "native-legacy" },
      );
    }

    try {
      // Persist the exact legacy array through the same crash-safe writer used
      // by normal saves. The source file is deliberately left untouched.
      await writeNativeArray(folderName, legacyData);
    } catch (error) {
      logger.warn(
        `[LeakRepository] Read legacy data from "${candidate.path}", but could not copy it to current storage:`,
        error,
      );
    }
    return { data: legacyData, source: candidate.path };
  }
  return null;
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
    return true;
  } catch (error) {
    logger.warn(
      `[LeakRepository] Could not update the localStorage mirror for "${key}":`,
      error,
    );
    return false;
  }
}

export const LeakRepository = {
  async getAll({ projectId, folderName, legacyStorageType }) {
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
          const mainMissing = isMissingFileError(mainError);
          const backupMissing = isMissingFileError(backupError);
          if (mainMissing && backupMissing) {
            const recovered = await recoverLegacyNativeArray(
              folderName,
              legacyStorageType,
              main,
            );
            if (!recovered) return [];
            logger.warn(
              `[LeakRepository] Migrated legacy native data from "${recovered.source}" without deleting the source file.`,
            );
            return filterValidLeaks(recovered.data, recovered.source);
          }

          logger.error(
            `[LeakRepository] Failed to read both "${main}" and "${backup}":`,
            mainError,
            backupError,
          );
          throw new ProjectDataReadError(
            "Project data and its recovery copy could not be read",
            {
              cause: mainMissing ? backupError : mainError,
              source: "native",
            },
          );
        }
      }
    }

    const key = STORAGE_KEYS.PROJECT_DATA(projectId);
    let indexedDbError = null;

    try {
      const indexedData = await readWebData(projectId);
      if (Array.isArray(indexedData)) {
        return filterValidLeaks(indexedData, `IndexedDB[${projectId}]`);
      }
      if (indexedData != null) {
        throw new TypeError(`Expected an array in IndexedDB[${projectId}]`);
      }
    } catch (err) {
      indexedDbError = err;
      logger.error("[LeakRepository] Failed to read IndexedDB:", err);
    }

    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        if (indexedDbError) {
          throw new ProjectDataReadError(
            "IndexedDB could not be read and no recovery mirror is available",
            { cause: indexedDbError, source: "indexeddb" },
          );
        }
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new TypeError(`Expected an array in localStorage[${key}]`);
      }
      await writeWebData(projectId, parsed).catch((error) => {
        logger.warn("[LeakRepository] Failed to migrate to IndexedDB:", error);
      });
      return filterValidLeaks(parsed, `localStorage[${key}]`);
    } catch (err) {
      if (err instanceof ProjectDataReadError) throw err;
      logger.error("[LeakRepository] Corrupted localStorage:", err);
      throw new ProjectDataReadError(
        "The local project data mirror is corrupted",
        { cause: err, source: "localstorage" },
      );
    }
  },

  async saveAll(leaks, { projectId, folderName }) {
    if (isNative) {
      await writeNativeArray(folderName, leaks);
      return;
    }

    let indexedDbSaved = false;
    let indexedDbError = null;
    try {
      indexedDbSaved = await writeWebData(projectId, leaks);
    } catch (error) {
      indexedDbError = error;
      logger.warn(
        `[LeakRepository] Could not save project "${projectId}" to IndexedDB:`,
        error,
      );
    }

    const localStorageSaved = saveWebDataToLocalStorage(projectId, leaks);
    if (!indexedDbSaved && !localStorageSaved) {
      throw new ProjectDataWriteError(
        "Project data could not be saved to IndexedDB or localStorage",
        { cause: indexedDbError },
      );
    }
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
