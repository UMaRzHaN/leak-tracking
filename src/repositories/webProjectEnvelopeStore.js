import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { logger } from "@/utils/logger";
import { normalizeWebEnvelope } from "@/repositories/webProjectEnvelope";

/**
 * Where a web (non-native) project copy physically lives: the IndexedDB
 * databases holding the primary and mirror copies, and the read-only legacy
 * locations kept for projects written by earlier schema versions.
 *
 * The envelope format itself lives in webProjectEnvelope.js. This module owns
 * *where* a copy is stored; deciding which copy wins, when to repair a stale
 * one and what to surface to the UI stays in LeakRepository.
 */

const WEB_DATA_DB = "LeakTrackingDataDB";
const WEB_DATA_STORE = "projects";
const WEB_DATA_VERSION = 2;

// The secondary copy lives in a database of its own, opened over a separate
// connection. That separation is the whole point: an IndexedDB failure is
// usually database-wide (the file is corrupt, or `open` itself rejects), and
// while both copies shared one connection a single failed open took out the
// primary and its backup together — leaving the backup unreachable in exactly
// the situation it exists for. Two databases fail independently.
//
// This does NOT protect against origin-level storage loss (browser eviction,
// "clear site data") or a quota that is exhausted for the whole origin —
// those take every local store with them, as they did when this copy still
// lived in localStorage.
const WEB_MIRROR_DB = "LeakTrackingMirrorDB";
const WEB_MIRROR_DB_VERSION = 1;

// Where the secondary copy lived in schema v2: an object store inside the
// primary database. Read-only now, purely so a project written by that build
// still has a recoverable backup; cleared per project once the dedicated
// mirror database holds the same data. The store itself is left in place —
// dropping it needs a version bump of the primary database, which is not
// worth the migration risk for an empty store.
const LEGACY_MIRROR_STORE = "projectsMirror";

// Each database gets its own opener holding its own connection, so a failed
// or closed connection is reset for that database alone.
function createDatabaseOpener(name, version, upgrade) {
  let connection = null;

  return function openDatabase() {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    if (connection) return connection;

    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, version);
      request.onupgradeneeded = () => upgrade(request.result);
      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          connection = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        connection = null;
        reject(request.error);
      };
    });

    return connection;
  };
}

const openWebDataDb = createDatabaseOpener(
  WEB_DATA_DB,
  WEB_DATA_VERSION,
  (db) => {
    if (!db.objectStoreNames.contains(WEB_DATA_STORE)) {
      db.createObjectStore(WEB_DATA_STORE, { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains(LEGACY_MIRROR_STORE)) {
      db.createObjectStore(LEGACY_MIRROR_STORE, { keyPath: "id" });
    }
  },
);

const openMirrorDb = createDatabaseOpener(
  WEB_MIRROR_DB,
  WEB_MIRROR_DB_VERSION,
  (db) => {
    if (!db.objectStoreNames.contains(WEB_DATA_STORE)) {
      db.createObjectStore(WEB_DATA_STORE, { keyPath: "id" });
    }
  },
);

async function readObjectStoreEnvelope(openDb, storeName, projectId) {
  const db = await openDb();
  if (!db || !projectId) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(projectId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeObjectStoreEnvelope(
  openDb,
  storeName,
  projectId,
  envelope,
) {
  const db = await openDb();
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

async function deleteObjectStoreEnvelope(openDb, storeName, projectId) {
  const db = await openDb();
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
  readObjectStoreEnvelope(openWebDataDb, WEB_DATA_STORE, projectId);
export const writeWebData = (projectId, envelope) =>
  writeObjectStoreEnvelope(openWebDataDb, WEB_DATA_STORE, projectId, envelope);
export const deleteWebData = (projectId) =>
  deleteObjectStoreEnvelope(openWebDataDb, WEB_DATA_STORE, projectId);

// Best effort throughout: the schema-v2 copy is a migration source, never the
// destination. It lives in the primary database, so reaching it can fail for
// reasons that say nothing about the health of the mirror database — those
// failures must stay invisible to the caller rather than mask a good mirror.
async function readLegacyMirrorEnvelope(projectId) {
  try {
    return await readObjectStoreEnvelope(
      openWebDataDb,
      LEGACY_MIRROR_STORE,
      projectId,
    );
  } catch {
    return null;
  }
}

async function clearLegacyMirrorEnvelope(projectId) {
  try {
    await deleteObjectStoreEnvelope(
      openWebDataDb,
      LEGACY_MIRROR_STORE,
      projectId,
    );
  } catch {
    // Leaving the schema-v2 entry behind is harmless: it is only ever read
    // when the dedicated mirror database has nothing for this project.
  }
}

/**
 * Reads the secondary copy, preferring the dedicated mirror database and
 * falling back to the schema-v2 store only when the former has nothing yet.
 * A read error from the mirror database propagates — that is a real signal
 * the caller must weigh — while the legacy fallback stays silent.
 *
 * Finding a schema-v2 copy also migrates it, because nothing else will: to
 * callers this value simply *is* the mirror, so the repair logic upstream sees
 * an up-to-date mirror and never writes it to its new home. Doing it here
 * keeps that one-time move invisible to LeakRepository. The copy is returned
 * whether or not the move succeeds — a project that cannot be migrated yet
 * must still be readable.
 */
export async function readMirrorData(projectId) {
  const current = await readObjectStoreEnvelope(
    openMirrorDb,
    WEB_DATA_STORE,
    projectId,
  );
  if (current != null) return current;

  const legacy = await readLegacyMirrorEnvelope(projectId);
  if (legacy == null) return null;

  try {
    const migrated = await writeObjectStoreEnvelope(
      openMirrorDb,
      WEB_DATA_STORE,
      projectId,
      legacy,
    );
    if (migrated) await clearLegacyMirrorEnvelope(projectId);
  } catch {
    // The schema-v2 entry stays put and will be retried on the next read.
  }
  return legacy;
}

export async function writeMirrorData(projectId, envelope) {
  const saved = await writeObjectStoreEnvelope(
    openMirrorDb,
    WEB_DATA_STORE,
    projectId,
    envelope,
  );
  // Only once the dedicated database is confirmed to hold this envelope is
  // the schema-v2 entry redundant. Dropping it earlier could discard the only
  // remaining backup.
  if (saved) await clearLegacyMirrorEnvelope(projectId);
  return saved;
}

export async function deleteMirrorData(projectId) {
  const deleted = await deleteObjectStoreEnvelope(
    openMirrorDb,
    WEB_DATA_STORE,
    projectId,
  );
  await clearLegacyMirrorEnvelope(projectId);
  return deleted;
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
