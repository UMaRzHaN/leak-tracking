import { createIdbConnection } from "@/repositories/idbConnection";
import {
  appendJournalEntry,
  applyJournalEntries,
  clearJournal,
  createJournalStore,
  isWorthJournalling,
  JOURNAL_MAX_ENTRIES,
  readJournal,
  WEB_JOURNAL_STORE,
} from "@/repositories/webProjectJournal";

/**
 * Одна запись конверта в IndexedDB: как открыть базы, как прочитать, записать,
 * дописать дельтой и удалить конверт по ключу.
 *
 * Здесь нет ни проектов, ни наборов данных — только ключ записи. Кто под каким
 * ключом лежит, решает webProjectEnvelopeStore.js; какая из копий свежее и что
 * показать человеку — LeakRepository и ComponentRepository. Сам формат конверта
 * живёт в webProjectEnvelope.js.
 */

const WEB_DATA_DB = "LeakTrackingDataDB";
const WEB_DATA_VERSION = 4;

// An envelope is stored as two records rather than one: the metadata that
// orders copies against each other, and the leak array itself. They live in
// separate stores of the same database and are always written in a single
// transaction, so a reader never sees one without the other.
//
// The split exists because deciding which copy is newer only needs the
// metadata, while the payload is megabytes on a real project. Reading a
// revision used to mean pulling — and structured-cloning — the whole array
// out of IndexedDB just to compare one number against another.
const WEB_META_STORE = "projects";
const WEB_PAYLOAD_STORE = "projectsData";

const ENVELOPE_STORES = [WEB_META_STORE, WEB_PAYLOAD_STORE, WEB_JOURNAL_STORE];

// The revision this tab last saw in each copy, whether it read or wrote it.
//
// A delta is only meaningful against the state it was computed from, and the
// caller's idea of that state came from this module. So a delta may be
// appended only while the stored revision is still the one we handed out or
// last wrote; anything else means another tab has written, and stacking a
// delta on an unknown state would corrupt it. Comparing revisions catches
// that for the price of a number, where verifying the caller's snapshot would
// mean checksumming the whole array again.
const observedRevisions = new Map();

function revisionKey(dbName, projectId) {
  return `${dbName}:${projectId}`;
}

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
const WEB_MIRROR_DB_VERSION = 3;

// Where the secondary copy lived in schema v2: an object store inside the
// primary database. Read-only now, purely so a project written by that build
// still has a recoverable backup; cleared per project once the dedicated
// mirror database holds the same data. The store itself is left in place —
// dropping it needs a version bump of the primary database, which is not
// worth the migration risk for an empty store.
const LEGACY_MIRROR_STORE = "projectsMirror";

function createEnvelopeStores(db) {
  if (!db.objectStoreNames.contains(WEB_META_STORE)) {
    db.createObjectStore(WEB_META_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(WEB_PAYLOAD_STORE)) {
    db.createObjectStore(WEB_PAYLOAD_STORE, { keyPath: "id" });
  }
  createJournalStore(db);
}

// Каждая база получает собственный открыватель со своим соединением: сбой или
// закрытие сбрасывается для неё одной, и основная копия не уносит с собой
// зеркало.
//
// Schema v2 records are left exactly where they are. They carry their leak
// array inline, which readEnvelope still understands, so an upgrade neither
// rewrites nor risks them; each project splits on its next write.
export const openWebDataDb = createIdbConnection(
  WEB_DATA_DB,
  WEB_DATA_VERSION,
  (db) => {
    createEnvelopeStores(db);
    if (!db.objectStoreNames.contains(LEGACY_MIRROR_STORE)) {
      db.createObjectStore(LEGACY_MIRROR_STORE, { keyPath: "id" });
    }
  },
);

export const openMirrorDb = createIdbConnection(
  WEB_MIRROR_DB,
  WEB_MIRROR_DB_VERSION,
  createEnvelopeStores,
);

// Settling on the transaction rather than the individual request means a read
// reports the same failures a write does, and every access below shares one
// error path.
function settleOnTransaction(tx, getResult) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(getResult());
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function readRecord(openDb, storeName, key) {
  const db = await openDb();
  if (!db || !key) return null;

  const tx = db.transaction(storeName, "readonly");
  const request = tx.objectStore(storeName).get(key);
  return settleOnTransaction(tx, () => request.result ?? null);
}

/**
 * Reassembles a stored envelope. A schema-v2 record holds its leak array
 * inline and is returned as-is; anything else has its payload fetched from
 * the payload store.
 *
 * A missing payload record yields an envelope whose `data` is undefined,
 * which normalizeWebEnvelope rejects — the correct outcome, because a
 * half-written copy must lose to a whole one rather than read as empty. The
 * exception is a tombstone, which normalizes to [] with no payload at all
 * and so survives even if its payload record is gone.
 */
export async function readEnvelope(openDb, key) {
  const db = await openDb();
  if (!db || !key) return null;

  const tx = db.transaction(ENVELOPE_STORES, "readonly");
  return settleOnTransaction(tx, issueEnvelopeRead(tx, key));
}

/**
 * Выдаёт запросы конверта в уже открытой транзакции и возвращает сборщик
 * результата — собирать его можно только когда транзакция завершилась.
 *
 * Разделено на выдачу и сборку затем, чтобы в одну транзакцию помещалось
 * несколько наборов сразу: `settleOnTransaction` вешает обработчик на саму
 * транзакцию, и второй вызов затёр бы первый.
 *
 * Наборы проекта — записи и реестр — читаются вместе: сборщик мусора
 * спрашивает «кто держит эту фотографию», и ответ, собранный из двух разных
 * транзакций, ложен ровно настолько, насколько между ними успели записать.
 */
function issueEnvelopeRead(tx, key) {
  const metaRequest = tx.objectStore(WEB_META_STORE).get(key);
  const payloadRequest = tx.objectStore(WEB_PAYLOAD_STORE).get(key);
  const journalRequest = readJournal(tx, key);

  return () => {
    const meta = metaRequest.result ?? null;
    if (meta == null) return null;
    // Schema v2 kept the array inline and predates the journal entirely.
    if ("data" in meta) return meta;

    const snapshot = payloadRequest.result?.data;
    if (!Array.isArray(snapshot)) return { ...meta, data: snapshot };
    return {
      ...meta,
      data: applyJournalEntries(snapshot, journalRequest.result),
    };
  };
}

// Both records go in one transaction, so the metadata that orders a copy can
// never be visible without the payload it describes.
// Rewrites the snapshot and drops the journal it supersedes — the compaction
// step, and the only path that pays for a full payload clone.
export async function writeEnvelope(openDb, key, envelope) {
  const db = await openDb();
  if (!db || !key) return false;

  const { data, ...meta } = envelope;
  const tx = db.transaction(ENVELOPE_STORES, "readwrite");
  tx.objectStore(WEB_META_STORE).put({ id: key, ...meta, journalSeq: 0 });
  tx.objectStore(WEB_PAYLOAD_STORE).put({ id: key, data });
  clearJournal(tx, key);
  return settleOnTransaction(tx, () => {
    observedRevisions.set(revisionKey(db.name, key), meta.revision);
    return true;
  });
}

/**
 * Records a change as a journal entry instead of rewriting the snapshot.
 *
 * The metadata still describes the assembled result, so the copy orders and
 * verifies exactly as a compacted one does; only the payload store is left
 * untouched. Both records go in one transaction, so a reader never sees
 * metadata promising a delta the journal does not hold.
 *
 * Returns false when the stored metadata is not the base this delta was built
 * from — another tab has written since — leaving the caller to fall back to a
 * full write rather than stack a delta on an unknown state.
 */
async function appendEnvelopeDelta(openDb, key, envelope, mutation) {
  const db = await openDb();
  if (!db || !key) return false;

  const meta = { ...envelope };
  delete meta.data;
  const tx = db.transaction(ENVELOPE_STORES, "readwrite");
  const metaStore = tx.objectStore(WEB_META_STORE);
  const currentRequest = metaStore.get(key);
  let appended = false;

  // Issued from inside the same transaction, so the base-revision check and
  // the append cannot be separated by another writer.
  currentRequest.onsuccess = () => {
    const current = currentRequest.result;
    const expected = observedRevisions.get(revisionKey(db.name, key));
    if (current == null || expected == null) return;
    if (current.revision !== expected) return;
    // A schema-v2 record has no snapshot to append to.
    if ("data" in current) return;

    const seq = Number(current.journalSeq ?? 0) + 1;
    if (seq > JOURNAL_MAX_ENTRIES) return;
    metaStore.put({ id: key, ...meta, journalSeq: seq });
    appendJournalEntry(tx, key, seq, mutation);
    appended = true;
  };

  return settleOnTransaction(tx, () => {
    if (appended) {
      observedRevisions.set(revisionKey(db.name, key), meta.revision);
    }
    return appended;
  });
}

export async function deleteEnvelope(openDb, key) {
  const db = await openDb();
  if (!db || !key) return false;

  const tx = db.transaction(ENVELOPE_STORES, "readwrite");
  deleteEnvelopeIn(tx, key);
  return settleOnTransaction(tx, () => {
    observedRevisions.delete(revisionKey(db.name, key));
    return true;
  });
}

/**
 * Удаление внутри уже открытой транзакции — чтобы все наборы проекта уходили
 * вместе. Удаление проекта, разложенное на несколько транзакций, умеет
 * оборваться посередине и оставить реестр от проекта, которого больше нет.
 */
export function deleteEnvelopeIn(tx, key) {
  tx.objectStore(WEB_META_STORE).delete(key);
  tx.objectStore(WEB_PAYLOAD_STORE).delete(key);
  clearJournal(tx, key);
}

export async function deleteRecord(openDb, storeName, key) {
  const db = await openDb();
  if (!db || !key) return false;

  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  return settleOnTransaction(tx, () => true);
}

/**
 * Persists an envelope, as a journal entry when a small mutation against a
 * known base is available and as a full snapshot otherwise. The delta path
 * declines rather than throws — a stale base, a full journal or a schema-v2
 * record all fall through to the snapshot write below.
 */
export async function saveEnvelope(openDb, key, envelope, mutation) {
  if (isWorthJournalling(mutation, envelope.data?.length ?? 0)) {
    const appended = await appendEnvelopeDelta(openDb, key, envelope, mutation);
    if (appended) return true;
  }
  return writeEnvelope(openDb, key, envelope);
}

/**
 * The revision of a stored copy, without reading its payload — the reason
 * metadata is a record of its own.
 *
 * Returns 0 for anything unusable: absent, unreadable, or holding a revision
 * that is not a sane integer. Zero is safe because the caller takes the
 * maximum against a clock-derived value, so an unknown copy can only fail to
 * raise the next revision, never lower it. A schema-v2 record still carries
 * its payload inline, so until that project is rewritten this is no cheaper
 * than a full read — just not wrong.
 */
export async function readStoredRevision(openDb, key) {
  let meta;
  try {
    meta = await readRecord(openDb, WEB_META_STORE, key);
  } catch {
    return 0;
  }
  const revision = Number(meta?.revision ?? meta?.timestamp ?? 0);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

// Best effort throughout: the schema-v2 copy is a migration source, never the
// destination. It lives in the primary database, so reaching it can fail for
// reasons that say nothing about the health of the mirror database — those
// failures must stay invisible to the caller rather than mask a good mirror.
export async function readLegacyMirrorEnvelope(key) {
  try {
    return await readRecord(openWebDataDb, LEGACY_MIRROR_STORE, key);
  } catch {
    return null;
  }
}

export async function clearLegacyMirrorEnvelope(key) {
  try {
    await deleteRecord(openWebDataDb, LEGACY_MIRROR_STORE, key);
  } catch {
    // Leaving the schema-v2 entry behind is harmless: it is only ever read
    // when the dedicated mirror database has nothing for this project.
  }
}

/**
 * Стирает набор ключей одной транзакцией на базу.
 *
 * Одной, а не по одной на ключ: удаление, разложенное на несколько
 * транзакций, умеет оборваться посередине и оставить половину.
 *
 * @param {() => Promise<IDBDatabase|null>} openDb
 * @param {string[]} keys
 */
export async function deleteEnvelopes(openDb, keys) {
  const db = await openDb();
  if (!db) return false;

  const tx = db.transaction(ENVELOPE_STORES, "readwrite");
  for (const key of keys) deleteEnvelopeIn(tx, key);
  return settleOnTransaction(tx, () => {
    for (const key of keys) observedRevisions.delete(revisionKey(db.name, key));
    return true;
  });
}
