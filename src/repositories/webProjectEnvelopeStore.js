import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { logger } from "@/utils/logger";

/**
 * Storage layer for the web (non-native) project envelope: the IndexedDB
 * database that holds it, the envelope format itself (checksum, revision,
 * tombstone), and the read-only legacy localStorage copy kept for projects
 * that predate schema v2.
 *
 * This module owns *how* a copy is stored. Deciding which copy wins, when to
 * repair a stale one and what to surface to the UI stays in LeakRepository.
 */

const WEB_DATA_DB = "LeakTrackingDataDB";
const WEB_DATA_STORE = "projects";
// Secondary full copy of the project envelope. Before schema v2 this copy
// lived in localStorage and was rewritten synchronously on every single
// save, which blocked the main thread and risked hitting the ~5-10MB
// localStorage quota on large projects. It now lives in its own IndexedDB
// object store (same async, non-blocking write path as the primary store)
// while keeping the exact same cross-validation/repair semantics.
const WEB_MIRROR_STORE = "projectsMirror";
const WEB_DATA_VERSION = 2;
const WEB_ENVELOPE_VERSION = 1;

export const LEGACY_WEB_ENVELOPE = Symbol("legacyWebEnvelope");

let webDataDbPromise = null;
let lastIssuedWebRevision = 0;

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
      if (!db.objectStoreNames.contains(WEB_MIRROR_STORE)) {
        db.createObjectStore(WEB_MIRROR_STORE, { keyPath: "id" });
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

async function readObjectStoreEnvelope(storeName, projectId) {
  const db = await openWebDataDb();
  if (!db || !projectId) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(projectId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeObjectStoreEnvelope(storeName, projectId, envelope) {
  const db = await openWebDataDb();
  if (!db || !projectId) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
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

async function deleteObjectStoreEnvelope(storeName, projectId) {
  const db = await openWebDataDb();
  if (!db || !projectId) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const request = tx.objectStore(storeName).delete(projectId);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const readWebData = (projectId) =>
  readObjectStoreEnvelope(WEB_DATA_STORE, projectId);
export const writeWebData = (projectId, envelope) =>
  writeObjectStoreEnvelope(WEB_DATA_STORE, projectId, envelope);
export const deleteWebData = (projectId) =>
  deleteObjectStoreEnvelope(WEB_DATA_STORE, projectId);

// Secondary copy. Same read/write/delete shape as the primary store above,
// just targeting the mirror object store instead of localStorage.
export const readMirrorData = (projectId) =>
  readObjectStoreEnvelope(WEB_MIRROR_STORE, projectId);
export const writeMirrorData = (projectId, envelope) =>
  writeObjectStoreEnvelope(WEB_MIRROR_STORE, projectId, envelope);
export const deleteMirrorData = (projectId) =>
  deleteObjectStoreEnvelope(WEB_MIRROR_STORE, projectId);

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

export function normalizeWebEnvelope(value, source) {
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

// Read-only: projects saved before schema v2 kept their only secondary copy
// as a full envelope in localStorage. This is consulted so those projects
// keep working across the upgrade, but nothing writes a full envelope back
// to localStorage anymore — new/ongoing secondary copies live in
// WEB_MIRROR_STORE instead. Once a project's IndexedDB copies are confirmed
// current the legacy key is removed (see clearLegacyLocalStorageEnvelope).
export function readLegacyLocalStorageEnvelope(projectId) {
  const key = STORAGE_KEYS.PROJECT_DATA(projectId);
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return normalizeWebEnvelope(JSON.parse(raw), `localStorage[${key}]`);
}

export function clearLegacyLocalStorageEnvelope(projectId) {
  try {
    localStorage.removeItem(STORAGE_KEYS.PROJECT_DATA(projectId));
  } catch (error) {
    // Best effort: leaving the legacy key behind is harmless once both
    // IndexedDB copies hold data at least as fresh as it.
    logger.warn(
      `[LeakRepository] Could not remove the legacy localStorage copy for "${projectId}":`,
      error,
    );
  }
}

// Last-resort fallback used only when neither IndexedDB store accepted a
// write (most commonly: IndexedDB is entirely unavailable in this browser).
// This is the only place that still writes a full envelope to localStorage,
// and it exists purely so the project keeps working somewhere durable in
// that narrow case — exactly like every web save did before schema v2.
export function writeLegacyLocalStorageEnvelope(projectId, envelope) {
  const key = STORAGE_KEYS.PROJECT_DATA(projectId);
  try {
    localStorage.setItem(key, JSON.stringify(envelope));
    return true;
  } catch (error) {
    logger.warn(
      `[LeakRepository] Could not write the localStorage fallback copy for "${key}":`,
      error,
    );
    return false;
  }
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

export function createWebEnvelope(
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

export function compareWebEnvelopes(left, right) {
  if (left.revision !== right.revision) return left.revision - right.revision;
  if (left.updatedAt !== right.updatedAt)
    return left.updatedAt - right.updatedAt;
  return 0;
}

export function sameWebEnvelope(left, right) {
  return (
    left?.revision === right?.revision &&
    left?.deleted === right?.deleted &&
    left?.checksum === right?.checksum
  );
}
