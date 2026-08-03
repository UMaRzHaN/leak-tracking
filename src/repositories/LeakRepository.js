import { isNative } from "@/utils/platform";
import { Directory } from "@capacitor/filesystem";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { PROJECT_META } from "@/configs/projects";
import { logger } from "@/utils/logger";
import { isValidLatitude, isValidLongitude } from "@/utils/coordinates";
import { requestPersistentStorage } from "@/services/persistentStorage";
import {
  getWebProjectDataReadFailurePolicy,
  isProjectDataReadWarningBlocking,
} from "@/repositories/projectDataReadState";
import {
  deleteNativeProjectStorage,
  isMissingNativeFileError,
  loadNativeProject,
  readNativeSnapshot,
  saveNativeProject,
  writeNativeProjectSnapshot,
} from "@/repositories/nativeLeakStorage";

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
  constructor(
    message,
    { cause, source, code, recoveryData, blocksWrites } = {},
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProjectDataReadError";
    this.code = code ?? "PROJECT_DATA_READ_FAILED";
    this.source = source ?? "unknown";
    if (recoveryData !== undefined) this.recoveryData = recoveryData;
    if (blocksWrites !== undefined) this.blocksWrites = Boolean(blocksWrites);
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

  const normalized = {
    ...item,
    status,
  };
  if (item.lat !== undefined) normalized.lat = lat;
  if (item.lng !== undefined) normalized.lng = lng;
  return normalized;
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

export { isProjectDataReadWarningBlocking };

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
      legacyData = (
        await readNativeSnapshot(candidate.path, candidate.directory)
      ).data;
    } catch (error) {
      if (isMissingNativeFileError(error)) continue;
      throw new ProjectDataReadError(
        `Legacy project data could not be read from "${candidate.path}"`,
        { cause: error, source: "native-legacy" },
      );
    }

    try {
      await writeNativeProjectSnapshot(folderName, legacyData);
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
      try {
        const loaded = await loadNativeProject(folderName);
        if (loaded) {
          if (loaded.recovered) {
            logger.warn(
              `[LeakRepository] Recovered project data from "${loaded.source}" after failing to read the main snapshot.`,
              loaded.mainError,
            );
          }
          return attachEmbeddedSyncState(
            filterValidLeaks(loaded.state.data, loaded.source),
            loaded.state.syncState,
          );
        }

        const recovered = await recoverLegacyNativeArray(
          folderName,
          legacyStorageType,
          `LeakReports/${folderName}/data/data.json`,
        );
        if (!recovered) return [];
        logger.warn(
          `[LeakRepository] Migrated legacy native data from "${recovered.source}" without deleting the source file.`,
        );
        return filterValidLeaks(recovered.data, recovered.source);
      } catch (error) {
        if (error instanceof ProjectDataReadError) throw error;
        logger.error(
          `[LeakRepository] Failed to read native project "${folderName}":`,
          error,
        );
        throw new ProjectDataReadError(
          "Project data and its recovery copy could not be read",
          { cause: error, source: "native" },
        );
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

    const readFailurePolicy = getWebProjectDataReadFailurePolicy({
      indexedDbError,
      localStorageError,
    });
    const readWarning = readFailurePolicy
      ? new ProjectDataReadError(
          "Project data was loaded from only one web storage copy",
          {
            ...readFailurePolicy,
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

  async saveAll(
    leaks,
    { projectId, folderName, syncState = null, previousLeaks = null },
  ) {
    if (isNative) {
      await saveNativeProject(folderName, leaks, { syncState, previousLeaks });
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
      await saveNativeProject(folderName, [], {
        syncState,
        forceSnapshot: true,
      });
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
      const deleted = await deleteNativeProjectStorage(folderName);
      if (!deleted) {
        await saveNativeProject(folderName, [], { forceSnapshot: true });
      }
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
