import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";

vi.mock("@/utils/platform", () => ({
  isNative: false,
}));

vi.mock("@capacitor/filesystem", () => ({
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
  Directory: { Data: "DATA" },
}));

const PROJECT = { projectId: "proj-big", folderName: "big_project" };
const PRIMARY_DB = "LeakTrackingDataDB";
const MIRROR_DB = "LeakTrackingMirrorDB";

// A copy is addressed by database *and* store: the mirror now lives in a
// database of its own so that one database failing cannot take the other with
// it, and both use the same store name.
// Since schema v3 an envelope is two records: metadata in `store` and the leak
// array in `payload`, written together in one transaction.
const PRIMARY = { db: PRIMARY_DB, store: "projects", payload: "projectsData" };
const MIRROR = { db: MIRROR_DB, store: "projects", payload: "projectsData" };
// Where the mirror lived in schema v2: a second store inside the primary
// database. Read-only now, kept only as a migration source.
const LEGACY_MIRROR = { db: PRIMARY_DB, store: "projectsMirror" };

const makeLeak = (id) => ({
  id,
  status: "open",
  lat: 41.297,
  lng: 69.258,
  leak_id: `L-${id}`,
  monitoringRecords: [{ id: `${id}-m1`, date: "2026-07-14T00:00:00.000Z" }],
});

// The legacy full-envelope mirror (pre schema-v2) lived under this
// localStorage key. Nothing writes a full envelope back here anymore; it is
// only read as a one-time migration source, so tests that pre-seed or
// inspect it still use this key directly.
function storageKey(projectId) {
  return `app:${projectId}:data_v1`;
}

async function loadRepository() {
  vi.resetModules();
  global.indexedDB = new IDBFactory();
  return import("./LeakRepository");
}

async function loadRepositoryWithoutIndexedDb() {
  vi.resetModules();
  global.indexedDB = undefined;
  return import("./LeakRepository");
}

function failLocalStorageWritesFor(key) {
  const originalSetItem = Storage.prototype.setItem;
  return vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(function setItem(storageKey, value) {
      if (storageKey === key) {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      }
      return originalSetItem.call(this, storageKey, value);
    });
}

// Simulates the mirror database rejecting a write (e.g. a transient
// browser-storage failure) while the primary keeps working, mirroring how the
// old test suite forced localStorage.setItem to fail for one key. Both stores
// are called "projects", so the database is what tells them apart.
function failMirrorWritesFor(projectId) {
  const originalPut = IDBObjectStore.prototype.put;
  return vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function put(value) {
      if (
        this.transaction.db.name === MIRROR_DB &&
        this.name === MIRROR.store &&
        value?.id === projectId
      ) {
        throw new DOMException("Mirror store put failed", "UnknownError");
      }
      return originalPut.call(this, value);
    });
}

// Simulates a whole database being unopenable — corruption, or the browser
// refusing the connection. This is the failure the split exists for: it must
// take out one database without touching the other.
function failDatabaseOpenFor(dbName) {
  const originalOpen = IDBFactory.prototype.open;
  return vi
    .spyOn(IDBFactory.prototype, "open")
    .mockImplementation(function open(name, version) {
      if (name !== dbName) return originalOpen.call(this, name, version);

      // Stands in for an IDBOpenDBRequest that never opens. The store module
      // only ever touches these members of it, and its onerror handler takes
      // no argument.
      const request = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: undefined,
        error: new DOMException("Database is corrupt", "UnknownError"),
      };
      Promise.resolve().then(() => request.onerror?.());
      return request;
    });
}

// Tests that seed a copy before the repository has ever run open the database
// themselves, so this creates the store when the database does not exist yet.
// An implicit create lands on version 1 with just that store, which is the
// mirror database's real schema and a valid starting point for the primary
// one — the repository's own upgrade to version 2 adds the rest.
async function openRawDb(location) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(location.db);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of [location.store, location.payload]) {
        if (name && !db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function overwriteStoreEntry(location, projectId, data, extra = {}) {
  const db = await openRawDb(location);
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(location.store, "readwrite");
    transaction
      .objectStore(location.store)
      .put({ id: projectId, data, ...extra });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
}

// Writes an envelope the way the store does: split across both records for a
// schema-v3 location, as a single inline record for the schema-v2 one.
async function writeStoreEnvelope(location, projectId, envelope) {
  const db = await openRawDb(location);
  const { data, ...meta } = envelope;
  await new Promise((resolve, reject) => {
    const stores = location.payload
      ? [location.store, location.payload]
      : [location.store];
    const transaction = db.transaction(stores, "readwrite");
    transaction
      .objectStore(location.store)
      .put(
        location.payload
          ? { id: projectId, ...meta }
          : { id: projectId, ...envelope },
      );
    if (location.payload) {
      transaction.objectStore(location.payload).put({ id: projectId, data });
    }
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
}

// Reassembles both records, mirroring how the store reads a copy back.
async function readStoreEnvelope(location, projectId) {
  const meta = await readStoreEntry(location, projectId);
  if (meta == null) return null;
  if ("data" in meta || !location.payload) return meta;
  const payload = await readStoreEntry(
    { ...location, store: location.payload },
    projectId,
  );
  return { ...meta, data: payload?.data };
}

async function readStoreEntry(location, projectId) {
  const db = await openRawDb(location);
  const result = await new Promise((resolve, reject) => {
    const transaction = db.transaction(location.store, "readonly");
    const request = transaction.objectStore(location.store).get(projectId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function deleteStoreEntry(location, projectId) {
  const db = await openRawDb(location);
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(location.store, "readwrite");
    transaction.objectStore(location.store).delete(projectId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
}

function readLegacyLocalStorageEnvelope(projectId) {
  const raw = localStorage.getItem(storageKey(projectId));
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LeakRepository web IndexedDB storage", () => {
  it("reads project leaks from IndexedDB when the mirror store is absent", async () => {
    const { LeakRepository } = await loadRepository();
    const leaks = [makeLeak("1"), makeLeak("2")];

    await LeakRepository.saveAll(leaks, PROJECT);
    await deleteStoreEntry(MIRROR, PROJECT.projectId);

    const result = await LeakRepository.getAll(PROJECT);
    expect(result).toHaveLength(2);
    expect(result.map((leak) => leak.id)).toEqual(["1", "2"]);
  });

  it("commits and recovers sync state with the same web data envelope", async () => {
    const { LeakRepository, getEmbeddedProjectSyncState } =
      await loadRepository();
    const syncState = {
      version: 2,
      generation: 0,
      epochId: "legacy",
      deleted: { "id:removed": 700 },
    };

    await LeakRepository.saveAll([makeLeak("current")], {
      ...PROJECT,
      syncState,
    });
    await deleteStoreEntry(MIRROR, PROJECT.projectId);

    const result = await LeakRepository.getAll(PROJECT);
    expect(result).toMatchObject([{ id: "current" }]);
    expect(getEmbeddedProjectSyncState(result)).toEqual(syncState);
  });

  it("clears IndexedDB project data", async () => {
    const { LeakRepository } = await loadRepository();

    await LeakRepository.saveAll([makeLeak("1")], PROJECT);
    await deleteStoreEntry(MIRROR, PROJECT.projectId);
    await LeakRepository.clear(PROJECT);

    await expect(LeakRepository.getAll(PROJECT)).resolves.toEqual([]);
  });

  it("purges both web copies after project metadata is removed", async () => {
    const { LeakRepository } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("1")], PROJECT);

    await LeakRepository.purge(PROJECT);

    expect(await readStoreEntry(PRIMARY, PROJECT.projectId)).toBeNull();
    expect(await readStoreEntry(MIRROR, PROJECT.projectId)).toBeNull();
    await expect(LeakRepository.getAll(PROJECT)).resolves.toEqual([]);
  });

  it("rejects malformed IndexedDB data when no recovery mirror exists", async () => {
    const { LeakRepository } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("1")], PROJECT);
    await deleteStoreEntry(MIRROR, PROJECT.projectId);
    await overwriteStoreEntry(PRIMARY, PROJECT.projectId, {
      not: "an array",
    });

    await expect(LeakRepository.getAll(PROJECT)).rejects.toMatchObject({
      code: "PROJECT_DATA_READ_FAILED",
      source: "indexeddb",
    });
  });

  it("loads a valid mirror as degraded read-only data when IndexedDB is malformed", async () => {
    const { LeakRepository, getProjectDataReadWarning } =
      await loadRepository();
    await LeakRepository.saveAll([makeLeak("recoverable")], PROJECT);
    // Corrupt only the primary store; the mirror store still holds the
    // valid envelope written by saveAll above.
    await overwriteStoreEntry(PRIMARY, PROJECT.projectId, {
      not: "an array",
    });

    const result = await LeakRepository.getAll(PROJECT);

    expect(result).toMatchObject([{ id: "recoverable" }]);
    expect(getProjectDataReadWarning(result)).toMatchObject({
      code: "PROJECT_DATA_DEGRADED",
      source: "indexeddb",
      blocksWrites: true,
    });
  });

  it("marks a broken mirror store as non-blocking when IndexedDB is valid", async () => {
    const {
      LeakRepository,
      getProjectDataReadWarning,
      isProjectDataReadWarningBlocking,
    } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("indexed")], PROJECT);
    // Corrupt only the mirror store; the primary store still holds the
    // valid envelope written by saveAll above.
    await overwriteStoreEntry(MIRROR, PROJECT.projectId, {
      not: "an array",
    });

    const result = await LeakRepository.getAll(PROJECT);
    const warning = getProjectDataReadWarning(result);

    expect(result).toMatchObject([{ id: "indexed" }]);
    expect(warning).toMatchObject({
      code: "PROJECT_DATA_DEGRADED",
      source: "mirror",
      blocksWrites: false,
    });
    expect(isProjectDataReadWarningBlocking(warning)).toBe(false);
    await expect(
      LeakRepository.saveAll([makeLeak("updated")], PROJECT),
    ).resolves.toBeUndefined();
  });

  it("does not guess between differing legacy web copies", async () => {
    const { LeakRepository } = await loadRepository();
    const indexedLegacy = [makeLeak("indexed-old")];
    const localLegacy = [makeLeak("local-new")];
    await LeakRepository.getAll(PROJECT);
    // Both copies predate envelope versioning: the primary store holds a
    // bare {data, timestamp} record and the pre schema-v2 secondary copy
    // sits in localStorage as a bare array. Neither carries a revision, so
    // they cannot be ordered safely.
    await overwriteStoreEntry(PRIMARY, PROJECT.projectId, indexedLegacy, {
      timestamp: 100,
    });
    localStorage.setItem(
      storageKey(PROJECT.projectId),
      JSON.stringify(localLegacy),
    );

    await expect(LeakRepository.getAll(PROJECT)).rejects.toMatchObject({
      code: "PROJECT_DATA_CONFLICT",
      source: "web-mirrors",
      recoveryData: {
        indexedDB: indexedLegacy,
        localStorage: localLegacy,
      },
    });
    expect(readLegacyLocalStorageEnvelope(PROJECT.projectId)).toEqual(
      localLegacy,
    );
  });

  it("keeps the previous mirror when IndexedDB saves but the mirror store write fails", async () => {
    const { LeakRepository } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("previous")], PROJECT);
    const previousMirror = await readStoreEnvelope(MIRROR, PROJECT.projectId);
    failMirrorWritesFor(PROJECT.projectId);

    await expect(
      LeakRepository.saveAll([makeLeak("current")], PROJECT),
    ).resolves.toBeUndefined();

    // The failed mirror write left both of its records unchanged.
    expect(await readStoreEnvelope(MIRROR, PROJECT.projectId)).toEqual(
      previousMirror,
    );
    await expect(LeakRepository.getAll(PROJECT)).resolves.toMatchObject([
      { id: "current" },
    ]);
  });

  it("selects a newer legacy localStorage revision and migrates it into IndexedDB", async () => {
    const { LeakRepository } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("previous")], PROJECT);
    const previous = await readStoreEntry(PRIMARY, PROJECT.projectId);
    const current = [makeLeak("current")];
    // Simulate a pre schema-v2 install where a newer full envelope was only
    // ever written to localStorage.
    localStorage.setItem(
      storageKey(PROJECT.projectId),
      JSON.stringify({
        version: 1,
        revision: previous.revision + 1,
        updatedAt: previous.updatedAt + 1,
        deleted: false,
        data: current,
      }),
    );

    await expect(LeakRepository.getAll(PROJECT)).resolves.toMatchObject([
      { id: "current" },
    ]);
    // The legacy copy is migrated into both IndexedDB stores and removed.
    expect(localStorage.getItem(storageKey(PROJECT.projectId))).toBeNull();
    await expect(LeakRepository.getAll(PROJECT)).resolves.toMatchObject([
      { id: "current" },
    ]);
  });

  it("keeps a newer IndexedDB revision when the mirror store is stale", async () => {
    const { LeakRepository } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("previous")], PROJECT);
    const stale = await readStoreEnvelope(MIRROR, PROJECT.projectId);
    await LeakRepository.saveAll([makeLeak("current")], PROJECT);
    await writeStoreEnvelope(MIRROR, PROJECT.projectId, stale);

    await expect(LeakRepository.getAll(PROJECT)).resolves.toMatchObject([
      { id: "current" },
    ]);
    expect(
      (await readStoreEnvelope(MIRROR, PROJECT.projectId)).data,
    ).toMatchObject([{ id: "current" }]);
  });

  it("uses a newer IndexedDB tombstone when the mirror store cannot be updated", async () => {
    const { LeakRepository } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("previous")], PROJECT);
    failMirrorWritesFor(PROJECT.projectId);

    await expect(LeakRepository.clear(PROJECT)).resolves.toBeUndefined();
    await expect(LeakRepository.getAll(PROJECT)).resolves.toEqual([]);
  });

  it("rejects the save when IndexedDB is unavailable and the localStorage fallback also fails", async () => {
    const { LeakRepository } = await loadRepositoryWithoutIndexedDb();
    const key = storageKey(PROJECT.projectId);
    const previous = [makeLeak("previous")];
    localStorage.setItem(key, JSON.stringify(previous));
    failLocalStorageWritesFor(key);

    await expect(
      LeakRepository.saveAll([makeLeak("current")], PROJECT),
    ).rejects.toMatchObject({
      code: "PROJECT_DATA_WRITE_FAILED",
    });
    // The failed fallback write left the previous copy untouched.
    expect(JSON.parse(localStorage.getItem(key))).toEqual(previous);
  });

  it("falls back to a full localStorage envelope when IndexedDB is entirely unavailable", async () => {
    const { LeakRepository } = await loadRepositoryWithoutIndexedDb();

    await expect(
      LeakRepository.saveAll([makeLeak("current")], PROJECT),
    ).resolves.toBeUndefined();
    await expect(LeakRepository.getAll(PROJECT)).resolves.toMatchObject([
      { id: "current" },
    ]);
  });

  // The reason the mirror has a database of its own. While both copies shared
  // one connection, a database that would not open took the primary and its
  // backup down together, and this recovery was impossible.
  it("recovers from the mirror database when the primary database cannot be opened", async () => {
    const { LeakRepository, getProjectDataReadWarning } =
      await loadRepository();
    await writeStoreEnvelope(MIRROR, PROJECT.projectId, {
      version: 1,
      revision: 5,
      updatedAt: 5,
      deleted: false,
      data: [makeLeak("mirror-only")],
    });
    failDatabaseOpenFor(PRIMARY_DB);

    const result = await LeakRepository.getAll(PROJECT);

    expect(result).toMatchObject([{ id: "mirror-only" }]);
    // The primary copy is unreadable, so its state is unknown and writes must
    // not proceed against it.
    expect(getProjectDataReadWarning(result)).toMatchObject({
      source: "indexeddb",
      blocksWrites: true,
    });
  });

  it("keeps working on the primary database when the mirror database cannot be opened", async () => {
    const { LeakRepository, getProjectDataReadWarning } =
      await loadRepository();
    failDatabaseOpenFor(MIRROR_DB);

    await expect(
      LeakRepository.saveAll([makeLeak("primary")], PROJECT),
    ).resolves.toBeUndefined();

    const result = await LeakRepository.getAll(PROJECT);
    expect(result).toMatchObject([{ id: "primary" }]);
    expect(getProjectDataReadWarning(result)).toMatchObject({
      source: "mirror",
      blocksWrites: false,
    });
  });

  it("migrates a schema-v2 mirror entry into the dedicated mirror database", async () => {
    const { LeakRepository } = await loadRepository();
    // A project last written by the build that kept the mirror in a second
    // store of the primary database.
    await writeStoreEnvelope(LEGACY_MIRROR, PROJECT.projectId, {
      version: 1,
      revision: 9,
      updatedAt: 9,
      deleted: false,
      data: [makeLeak("v2-mirror")],
    });

    await expect(LeakRepository.getAll(PROJECT)).resolves.toMatchObject([
      { id: "v2-mirror" },
    ]);

    expect(
      (await readStoreEnvelope(MIRROR, PROJECT.projectId)).data,
    ).toMatchObject([{ id: "v2-mirror" }]);
    expect(await readStoreEntry(LEGACY_MIRROR, PROJECT.projectId)).toBeNull();
  });

  it("purges the primary, mirror and schema-v2 copies together", async () => {
    const { LeakRepository } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("1")], PROJECT);
    await writeStoreEnvelope(LEGACY_MIRROR, PROJECT.projectId, {
      version: 1,
      revision: 1,
      updatedAt: 1,
      deleted: false,
      data: [makeLeak("stale-v2")],
    });

    await LeakRepository.purge(PROJECT);

    expect(await readStoreEntry(PRIMARY, PROJECT.projectId)).toBeNull();
    expect(await readStoreEntry(MIRROR, PROJECT.projectId)).toBeNull();
    expect(await readStoreEntry(LEGACY_MIRROR, PROJECT.projectId)).toBeNull();
    // Purging metadata but leaving payloads behind would strand megabytes.
    for (const location of [PRIMARY, MIRROR]) {
      expect(
        await readStoreEntry(
          { ...location, store: location.payload },
          PROJECT.projectId,
        ),
      ).toBeNull();
    }
    await expect(LeakRepository.getAll(PROJECT)).resolves.toEqual([]);
  });

  // A deleted project still has to report a degraded read: the caller decides
  // whether writes are safe from that warning, and a tombstone returns early
  // before the normal result is assembled.
  it("carries the degraded-read warning on a deleted project", async () => {
    const { LeakRepository, getProjectDataReadWarning } =
      await loadRepository();
    await LeakRepository.saveAll([makeLeak("1")], PROJECT);
    await LeakRepository.clear(PROJECT);
    await overwriteStoreEntry(MIRROR, PROJECT.projectId, { not: "an array" });

    const result = await LeakRepository.getAll(PROJECT);

    expect(result).toEqual([]);
    expect(getProjectDataReadWarning(result)).toMatchObject({
      source: "mirror",
      blocksWrites: false,
    });
  });

  // Schema v2 kept the leak array inline in the metadata record. Those records
  // are not rewritten by the version upgrade, so reading one has to keep
  // working, and the split happens on the project's next write.
  it("reads a schema-v2 inline record and splits it on the next save", async () => {
    const { LeakRepository } = await loadRepository();
    await overwriteStoreEntry(PRIMARY, PROJECT.projectId, [makeLeak("v2")], {
      version: 1,
      revision: 7,
      updatedAt: 7,
      deleted: false,
    });

    await expect(LeakRepository.getAll(PROJECT)).resolves.toMatchObject([
      { id: "v2" },
    ]);

    await LeakRepository.saveAll([makeLeak("v3")], PROJECT);

    const meta = await readStoreEntry(PRIMARY, PROJECT.projectId);
    expect(meta).not.toHaveProperty("data");
    expect(
      (
        await readStoreEntry(
          { ...PRIMARY, store: PRIMARY.payload },
          PROJECT.projectId,
        )
      ).data,
    ).toMatchObject([{ id: "v3" }]);
  });

  // Metadata and payload are written in one transaction, so this state should
  // be unreachable — but if it ever occurs, a half-written copy must lose to a
  // whole one instead of being read as an empty project.
  it("rejects a copy whose payload record is missing", async () => {
    const { LeakRepository } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("intact")], PROJECT);
    // A far newer mirror that would win on revision — written as metadata with
    // no `data` key at all, then stripped of its payload record.
    await writeStoreEnvelope(MIRROR, PROJECT.projectId, {
      version: 1,
      revision: Number.MAX_SAFE_INTEGER - 1,
      updatedAt: Date.now() + 60_000,
      deleted: false,
    });
    await deleteStoreEntry(
      { ...MIRROR, store: MIRROR.payload },
      PROJECT.projectId,
    );
    const torn = await readStoreEntry(MIRROR, PROJECT.projectId);
    expect(torn).not.toHaveProperty("data");

    await expect(LeakRepository.getAll(PROJECT)).resolves.toMatchObject([
      { id: "intact" },
    ]);
  });

  it("drops the legacy localStorage copy once a save reaches IndexedDB", async () => {
    const { LeakRepository } = await loadRepository();
    const key = storageKey(PROJECT.projectId);
    // A project carried over from a pre schema-v2 install.
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        revision: 3,
        updatedAt: 3,
        deleted: false,
        data: [makeLeak("legacy")],
      }),
    );

    await LeakRepository.saveAll([makeLeak("current")], PROJECT);

    expect(localStorage.getItem(key)).toBeNull();
    await expect(LeakRepository.getAll(PROJECT)).resolves.toMatchObject([
      { id: "current" },
    ]);
  });
});
