/**
 * The journal of deltas appended since a project's last snapshot: its store,
 * how entries read back and fold into a snapshot, and when a change is too
 * large to be worth journalling at all.
 *
 * Transactions belong to webProjectEnvelopeStore.js, which passes one in. An
 * entry must be written in the same transaction as the metadata describing
 * it, so this module never opens one of its own.
 */

// Appended deltas that have not been folded into the payload snapshot yet.
// Rewriting a 30 MB array to change one field costs two structured clones of
// the whole thing — measurably the largest part of a save — so an edit that
// touches few records appends one small entry instead, and the snapshot is
// rewritten only when the journal has grown enough to be worth compacting.
//
// The metadata still describes the *assembled* state: its revision orders the
// copy, and its checksum covers the snapshot with every journal entry applied.
// A corrupt or missing entry therefore fails the same checksum test as a
// corrupt payload always has, and the copy loses to an intact one.
export const WEB_JOURNAL_STORE = "projectsJournal";
const WEB_JOURNAL_BY_PROJECT = "byProject";

// Compaction thresholds, mirroring the native journal in
// legacyNativeLeakStorage.js so both platforms behave alike.
export const JOURNAL_MAX_ENTRIES = 40;
const JOURNAL_MAX_CHANGED_RECORDS = 250;
const JOURNAL_MAX_CHANGED_RATIO = 0.25;

export function readJournal(tx, projectId) {
  return tx
    .objectStore(WEB_JOURNAL_STORE)
    .index(WEB_JOURNAL_BY_PROJECT)
    .getAll(projectId);
}

// Index results are ordered by index key then primary key, so within one
// project this drops entries in append order.
export function clearJournal(tx, projectId) {
  const store = tx.objectStore(WEB_JOURNAL_STORE);
  const keysRequest = store.index(WEB_JOURNAL_BY_PROJECT).getAllKeys(projectId);
  keysRequest.onsuccess = () => {
    for (const key of keysRequest.result) store.delete(key);
  };
}

/**
 * Folds appended deltas into a snapshot. Records are matched by id; an upsert
 * for an unknown id appends, which is the only order change the mutation
 * builder allows, so replaying preserves the order the writer saw.
 *
 * The map holds that order itself: `set` leaves an existing key where it is,
 * and a key that was deleted first comes back at the end — which is where the
 * writer put it too. A separate list of positions used to track this, but it
 * kept every position a key had ever had, so a record deleted in one delta and
 * re-added in a later one was assembled twice. The metadata describes the
 * assembled state, so a duplicate here fails the checksum its writer computed
 * without it and the copy is discarded — the mirror along with it, being
 * written from the same delta.
 */
export function applyJournalEntries(data, entries) {
  if (!entries.length) return data;

  const byId = new Map();
  for (const record of data) byId.set(String(record?.id), record);
  for (const entry of entries) {
    for (const id of entry.deletedIds ?? []) byId.delete(String(id));
    for (const record of entry.upserts ?? []) {
      byId.set(String(record?.id), record);
    }
  }
  return [...byId.values()];
}

// A change large enough that replaying it would cost more than it saves is
// better written as a fresh snapshot.
export function isWorthJournalling(mutation, nextLength) {
  if (!mutation) return false;
  const changed = mutation.upserts.length + mutation.deletedIds.length;
  if (changed > JOURNAL_MAX_CHANGED_RECORDS) return false;
  return !(
    nextLength >= 500 &&
    changed / Math.max(nextLength, 1) > JOURNAL_MAX_CHANGED_RATIO
  );
}

// Creates the store on database upgrade.
export function createJournalStore(db) {
  if (db.objectStoreNames.contains(WEB_JOURNAL_STORE)) return;
  const store = db.createObjectStore(WEB_JOURNAL_STORE, {
    keyPath: ["projectId", "seq"],
  });
  store.createIndex(WEB_JOURNAL_BY_PROJECT, "projectId");
}

// Records one delta. The caller supplies the sequence, having read the
// previous one from the metadata inside the same transaction.
export function appendJournalEntry(tx, projectId, seq, mutation) {
  tx.objectStore(WEB_JOURNAL_STORE).put({
    projectId,
    seq,
    upserts: mutation.upserts,
    deletedIds: mutation.deletedIds,
  });
}
