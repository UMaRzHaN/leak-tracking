import { isNative } from "@/utils/platform";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { PROJECT_META } from "@/configs/projects";
import { logger } from "@/utils/logger";
import { isValidLatitude, isValidLongitude } from "@/utils/coordinates";
import { requestPersistentStorage } from "@/services/persistentStorage";

const VALID_STATUSES = new Set(["open", "in_progress", "resolved"]);
const WEB_DATA_DB = "LeakTrackingDataDB";
const WEB_DATA_STORE = "projects";
const WEB_DATA_VERSION = 1;
const WEB_ENVELOPE_VERSION = 1;
const PRESERVED_INVALID_RECORDS = Symbol("preservedInvalidLeakRecords");
const WEB_READ_WARNING = Symbol("webProjectDataReadWarning");
const LEGACY_WEB_ENVELOPE = Symbol("legacyWebEnvelope");
const EMBEDDED_SYNC_STATE = Symbol("embeddedProjectSyncState");

let webDataDbPromise = null;
let lastIssuedWebRevision = 0;

export class ProjectDataReadError extends Error {
  /** @param {string} message @param {any} [options] */
  constructor(message, { cause, source, code, recoveryData } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProjectDataReadError";
    this.code = code ?? "PROJECT_DATA_READ_FAILED";
    this.source = source ?? "unknown";
    if (recoveryData !== undefined) this.recoveryData = recoveryData;
  }
}

export class ProjectDataWriteError extends Error {
  /** @param {string} message @param {any} [options] */
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
  if (lat != null && !isValidLatitude(lat)) return null;
  if (lng != null && !isValidLongitude(lng)) return null;

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

export function getProjectDataReadWarning(leaks) {
  return leaks?.[WEB_READ_WARNING] ?? null;
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

function normalizeNativeProjectState(value, path) {
  if (Array.isArray(value)) return { data: value, syncState: null };
  if (
    value &&
    typeof value === "object" &&
    value.version === 2 &&
    Array.isArray(value.data)
  ) {
    return { data: value.data, syncState: value.syncState ?? null };
  }
  throw new TypeError(`Expected project data in ${path}`);
}

async function readNativeProjectState(path, directory = Directory.Data) {
  const result = await Filesystem.readFile({
    path,
    directory,
    encoding: Encoding.UTF8,
  });
  return normalizeNativeProjectState(
    JSON.parse(String(result.data || "[]")),
    path,
  );
}

async function readNativeArray(path, directory = Directory.Data) {
  return (await readNativeProjectState(path, directory)).data;
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

async function writeNativeArray(folderName, leaks, syncState = null) {
  const paths = getMobileRecoveryPaths(folderName);
  const serialized = JSON.stringify(
    syncState == null ? leaks : { version: 2, data: leaks, syncState },
  );
  await ensureDir(paths.temp);

  await Filesystem.writeFile({
    path: paths.temp,
    directory: Directory.Data,
    data: serialized,
    encoding: Encoding.UTF8,
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
    request.onupgradeneeded = () => {
      const db = request.result;
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
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeWebData(projectId, envelope) {
  const db = await openWebDataDb();
  if (!db || !projectId) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_DATA_STORE, "readwrite");
    const store = tx.objectStore(WEB_DATA_STORE);
    const request = store.put({
      id: projectId,
      ...envelope,
    });
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function deleteWebData(projectId) {
  const db = await openWebDataDb();
  if (!db || !projectId) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_DATA_STORE, "readwrite");
    const request = tx.objectStore(WEB_DATA_STORE).delete(projectId);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function checksumWebPayload(data, deleted, syncState = null) {
  const value = JSON.stringify({
    deleted: Boolean(deleted),
    data,
    ...(syncState == null ? {} : { syncState }),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeWebEnvelope(value, source) {
  if (value == null) return null;

  // Backward compatibility for data written before mirrored revisions existed.
  if (Array.isArray(value)) {
    const envelope = {
      version: 0,
      revision: 0,
      updatedAt: 0,
      deleted: false,
      checksum: checksumWebPayload(value, false),
      data: value,
      syncState: null,
    };
    Object.defineProperty(envelope, LEGACY_WEB_ENVELOPE, {
      value: true,
    });
    return envelope;
  }

  const deleted = value.deleted === true;
  const data = deleted && value.data == null ? [] : value.data;
  const syncState = value.syncState ?? null;
  if (!Array.isArray(data)) {
    throw new TypeError(`Expected a data array in ${source}`);
  }

  const revision = Number(value.revision ?? value.timestamp ?? 0);
  const updatedAt = Number(value.updatedAt ?? value.timestamp ?? 0);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new TypeError(`Invalid revision in ${source}`);
  }
  if (!Number.isFinite(updatedAt) || updatedAt < 0) {
    throw new TypeError(`Invalid updatedAt in ${source}`);
  }

  const expectedChecksum = checksumWebPayload(data, deleted, syncState);
  if (value.checksum != null && value.checksum !== expectedChecksum) {
    throw new TypeError(`Checksum mismatch in ${source}`);
  }

  const envelope = {
    version: Number(value.version ?? 0),
    revision,
    updatedAt,
    deleted,
    checksum: expectedChecksum,
    data,
    syncState,
  };
  if (value.version == null && value.revision == null) {
    Object.defineProperty(envelope, LEGACY_WEB_ENVELOPE, { value: true });
  }
  return envelope;
}

function readWebDataFromLocalStorage(projectId) {
  const key = STORAGE_KEYS.PROJECT_DATA(projectId);
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return normalizeWebEnvelope(JSON.parse(raw), `localStorage[${key}]`);
}

function nextWebRevision(envelopes = []) {
  const knownRevision = envelopes.reduce(
    (maximum, envelope) => Math.max(maximum, envelope?.revision ?? 0),
    0,
  );
  const clockRevision = Date.now() * 1000;
  lastIssuedWebRevision = Math.max(
    clockRevision,
    knownRevision + 1,
    lastIssuedWebRevision + 1,
  );
  return lastIssuedWebRevision;
}

function createWebEnvelope(
  data,
  { deleted = false, previous = [], syncState = null } = {},
) {
  const revision = nextWebRevision(previous);
  const updatedAt = Date.now();
  return {
    version: WEB_ENVELOPE_VERSION,
    revision,
    updatedAt,
    deleted,
    checksum: checksumWebPayload(data, deleted, syncState),
    data,
    ...(syncState == null ? {} : { syncState }),
  };
}

function compareWebEnvelopes(left, right) {
  if (left.revision !== right.revision) return left.revision - right.revision;
  if (left.updatedAt !== right.updatedAt)
    return left.updatedAt - right.updatedAt;
  return 0;
}

function sameWebEnvelope(left, right) {
  return (
    left?.revision === right?.revision &&
    left?.deleted === right?.deleted &&
    left?.checksum === right?.checksum
  );
}

function saveWebDataToLocalStorage(projectId, envelope) {
  const key = STORAGE_KEYS.PROJECT_DATA(projectId);
  try {
    localStorage.setItem(key, JSON.stringify(envelope));
    return true;
  } catch (error) {
    logger.warn(
      `[LeakRepository] Could not update the localStorage mirror for "${key}":`,
      error,
    );
    return false;
  }
}

function attachEmbeddedSyncState(leaks, syncState) {
  if (syncState != null) {
    Object.defineProperty(leaks, EMBEDDED_SYNC_STATE, {
      value: syncState,
      enumerable: false,
    });
  }
  return leaks;
}

export function getEmbeddedProjectSyncState(leaks) {
  return leaks?.[EMBEDDED_SYNC_STATE] ?? null;
}

export const LeakRepository = {
  async getAll({ projectId, folderName, legacyStorageType = null }) {
    if (isNative) {
      const { main, backup } = getMobileRecoveryPaths(folderName);
      try {
        const state = await readNativeProjectState(main);
        return attachEmbeddedSyncState(
          filterValidLeaks(state.data, main),
          state.syncState,
        );
      } catch (mainError) {
        try {
          const recovered = await readNativeProjectState(backup);
          logger.warn(
            `[LeakRepository] Recovered project data from "${backup}" after failing to read "${main}".`,
            mainError,
          );
          return attachEmbeddedSyncState(
            filterValidLeaks(recovered.data, backup),
            recovered.syncState,
          );
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

    let indexedEnvelope = null;
    let localEnvelope = null;
    let indexedDbError = null;
    let localStorageError = null;

    try {
      indexedEnvelope = normalizeWebEnvelope(
        await readWebData(projectId),
        `IndexedDB[${projectId}]`,
      );
    } catch (error) {
      indexedDbError = error;
      logger.error("[LeakRepository] Failed to read IndexedDB:", error);
    }

    try {
      localEnvelope = readWebDataFromLocalStorage(projectId);
    } catch (error) {
      localStorageError = error;
      logger.error("[LeakRepository] Corrupted localStorage:", error);
    }

    const available = [indexedEnvelope, localEnvelope].filter(Boolean);
    if (available.length === 0) {
      if (indexedDbError || localStorageError) {
        const source = indexedDbError ? "indexeddb" : "localstorage";
        throw new ProjectDataReadError(
          "No valid project data copy is available",
          { cause: indexedDbError ?? localStorageError, source },
        );
      }
      return [];
    }

    if (
      indexedEnvelope?.[LEGACY_WEB_ENVELOPE] &&
      localEnvelope?.[LEGACY_WEB_ENVELOPE] &&
      indexedEnvelope.checksum !== localEnvelope.checksum
    ) {
      throw new ProjectDataReadError(
        "Legacy IndexedDB and localStorage copies differ and cannot be ordered safely",
        {
          source: "web-mirrors",
          code: "PROJECT_DATA_CONFLICT",
          recoveryData: {
            indexedDB: indexedEnvelope.data,
            localStorage: localEnvelope.data,
          },
        },
      );
    }

    const selected = available.reduce((latest, candidate) =>
      compareWebEnvelopes(candidate, latest) > 0 ? candidate : latest,
    );

    // Repair only stores that were read successfully. A transient read error
    // must never cause an older fallback copy to overwrite an unknown version.
    if (!indexedDbError && !sameWebEnvelope(indexedEnvelope, selected)) {
      await writeWebData(projectId, selected).catch((error) => {
        logger.warn("[LeakRepository] Failed to repair IndexedDB:", error);
      });
    }
    if (!localStorageError && !sameWebEnvelope(localEnvelope, selected)) {
      saveWebDataToLocalStorage(projectId, selected);
    }

    const readWarning =
      indexedDbError || localStorageError
        ? new ProjectDataReadError(
            "Project data was loaded from only one web storage copy",
            {
              cause: indexedDbError ?? localStorageError,
              source: indexedDbError ? "indexeddb" : "localstorage",
              code: "PROJECT_DATA_DEGRADED",
              recoveryData: selected.data,
            },
          )
        : null;
    if (selected.deleted) {
      const empty = [];
      attachEmbeddedSyncState(empty, selected.syncState);
      if (readWarning) {
        Object.defineProperty(empty, WEB_READ_WARNING, {
          value: readWarning,
        });
      }
      return empty;
    }
    const selectedSource =
      selected === indexedEnvelope ? "IndexedDB" : "localStorage";
    const result = filterValidLeaks(
      selected.data,
      `${selectedSource}[${projectId}]`,
    );
    attachEmbeddedSyncState(result, selected.syncState);
    if (readWarning) {
      Object.defineProperty(result, WEB_READ_WARNING, { value: readWarning });
    }
    return result;
  },

  async saveAll(leaks, { projectId, folderName, syncState = null }) {
    if (isNative) {
      await writeNativeArray(folderName, leaks, syncState);
      return;
    }

    let indexedDbSaved = false;
    let indexedDbError = null;
    let indexedEnvelope = null;
    let localEnvelope = null;
    try {
      indexedEnvelope = normalizeWebEnvelope(
        await readWebData(projectId),
        `IndexedDB[${projectId}]`,
      );
    } catch {
      // A new clock-based revision remains newer in normal operation.
    }
    try {
      localEnvelope = readWebDataFromLocalStorage(projectId);
    } catch {
      // The valid destination will replace a corrupted mirror.
    }
    const envelope = createWebEnvelope(leaks, {
      previous: [indexedEnvelope, localEnvelope],
      syncState,
    });
    try {
      indexedDbSaved = await writeWebData(projectId, envelope);
    } catch (error) {
      indexedDbError = error;
      logger.warn(
        `[LeakRepository] Could not save project "${projectId}" to IndexedDB:`,
        error,
      );
    }

    const localStorageSaved = saveWebDataToLocalStorage(projectId, envelope);
    if (!indexedDbSaved && !localStorageSaved) {
      throw new ProjectDataWriteError(
        "Project data could not be saved to IndexedDB or localStorage",
        { cause: indexedDbError },
      );
    }
    requestPersistentStorage().catch((error) => {
      logger.warn(
        "[LeakRepository] Persistent web storage was not granted:",
        error,
      );
    });
  },

  async clear({ projectId, folderName, syncState = null }) {
    if (isNative) {
      await writeNativeArray(folderName, [], syncState);
      return;
    }
    let indexedEnvelope = null;
    let localEnvelope = null;
    try {
      indexedEnvelope = normalizeWebEnvelope(
        await readWebData(projectId),
        `IndexedDB[${projectId}]`,
      );
    } catch {
      // Continue with a newer tombstone so a stale mirror cannot resurrect data.
    }
    try {
      localEnvelope = readWebDataFromLocalStorage(projectId);
    } catch {
      // Continue and replace the corrupted mirror if possible.
    }
    const tombstone = createWebEnvelope([], {
      deleted: true,
      previous: [indexedEnvelope, localEnvelope],
      syncState,
    });
    let indexedDbSaved = false;
    let indexedDbError = null;
    try {
      indexedDbSaved = await writeWebData(projectId, tombstone);
    } catch (error) {
      indexedDbError = error;
    }
    const localStorageSaved = saveWebDataToLocalStorage(projectId, tombstone);
    if (!indexedDbSaved && !localStorageSaved) {
      throw new ProjectDataWriteError(
        "Project deletion could not be persisted",
        {
          cause: indexedDbError,
        },
      );
    }
  },

  async purge({ projectId, folderName }) {
    if (isNative) {
      await writeNativeArray(folderName, []);
      return;
    }

    let indexedDbError = null;
    try {
      await deleteWebData(projectId);
    } catch (error) {
      indexedDbError = error;
    }
    let localStorageError = null;
    try {
      localStorage.removeItem(STORAGE_KEYS.PROJECT_DATA(projectId));
    } catch (error) {
      localStorageError = error;
    }
    if (indexedDbError || localStorageError) {
      throw new ProjectDataWriteError("Project data could not be purged", {
        cause: indexedDbError ?? localStorageError,
      });
    }
  },
};
