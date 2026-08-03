import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

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

const makeLeak = (id) => ({
  id,
  status: "open",
  lat: 41.297,
  lng: 69.258,
  leak_id: `L-${id}`,
  monitoringRecords: [{ id: `${id}-m1`, date: "2026-07-14T00:00:00.000Z" }],
});

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

async function overwriteIndexedProjectData(projectId, data, extra = {}) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("LeakTrackingDataDB", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  await new Promise((resolve, reject) => {
    const transaction = db.transaction("projects", "readwrite");
    transaction.objectStore("projects").put({ id: projectId, data, ...extra });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
}

function readLocalEnvelope(projectId) {
  return JSON.parse(localStorage.getItem(storageKey(projectId)));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LeakRepository web IndexedDB storage", () => {
  it("reads project leaks from IndexedDB when localStorage mirror is absent", async () => {
    const { LeakRepository } = await loadRepository();
    const leaks = [makeLeak("1"), makeLeak("2")];

    await LeakRepository.saveAll(leaks, PROJECT);
    localStorage.removeItem(storageKey(PROJECT.projectId));

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
    localStorage.removeItem(storageKey(PROJECT.projectId));

    const result = await LeakRepository.getAll(PROJECT);
    expect(result).toMatchObject([{ id: "current" }]);
    expect(getEmbeddedProjectSyncState(result)).toEqual(syncState);
  });

  it("clears IndexedDB project data", async () => {
    const { LeakRepository } = await loadRepository();

    await LeakRepository.saveAll([makeLeak("1")], PROJECT);
    localStorage.removeItem(storageKey(PROJECT.projectId));
    await LeakRepository.clear(PROJECT);

    await expect(LeakRepository.getAll(PROJECT)).resolves.toEqual([]);
  });

  it("purges both web copies after project metadata is removed", async () => {
    const { LeakRepository } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("1")], PROJECT);

    await LeakRepository.purge(PROJECT);

    expect(localStorage.getItem(storageKey(PROJECT.projectId))).toBeNull();
    await expect(LeakRepository.getAll(PROJECT)).resolves.toEqual([]);
  });

  it("rejects malformed IndexedDB data when no recovery mirror exists", async () => {
    const { LeakRepository } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("1")], PROJECT);
    localStorage.removeItem(storageKey(PROJECT.projectId));
    await overwriteIndexedProjectData(PROJECT.projectId, { not: "an array" });

    await expect(LeakRepository.getAll(PROJECT)).rejects.toMatchObject({
      code: "PROJECT_DATA_READ_FAILED",
      source: "indexeddb",
    });
  });

  it("loads a valid mirror as degraded read-only data when IndexedDB is malformed", async () => {
    const { LeakRepository, getProjectDataReadWarning } =
      await loadRepository();
    await LeakRepository.saveAll([makeLeak("recoverable")], PROJECT);
    await overwriteIndexedProjectData(PROJECT.projectId, { not: "an array" });

    const result = await LeakRepository.getAll(PROJECT);

    expect(result).toMatchObject([{ id: "recoverable" }]);
    expect(getProjectDataReadWarning(result)).toMatchObject({
      code: "PROJECT_DATA_DEGRADED",
      source: "indexeddb",
      blocksWrites: true,
    });
  });

  it("marks a broken localStorage mirror as non-blocking when IndexedDB is valid", async () => {
    const {
      LeakRepository,
      getProjectDataReadWarning,
      isProjectDataReadWarningBlocking,
    } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("indexed")], PROJECT);
    localStorage.setItem(storageKey(PROJECT.projectId), "not-json{{");

    const result = await LeakRepository.getAll(PROJECT);
    const warning = getProjectDataReadWarning(result);

    expect(result).toMatchObject([{ id: "indexed" }]);
    expect(warning).toMatchObject({
      code: "PROJECT_DATA_DEGRADED",
      source: "localstorage",
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
    await overwriteIndexedProjectData(PROJECT.projectId, indexedLegacy, {
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
    expect(
      JSON.parse(localStorage.getItem(storageKey(PROJECT.projectId))),
    ).toEqual(localLegacy);
  });

  it("keeps the previous mirror when IndexedDB saves but localStorage is full", async () => {
    const { LeakRepository } = await loadRepository();
    const key = storageKey(PROJECT.projectId);
    const previous = [makeLeak("previous")];
    localStorage.setItem(key, JSON.stringify(previous));
    failLocalStorageWritesFor(key);

    await expect(
      LeakRepository.saveAll([makeLeak("current")], PROJECT),
    ).resolves.toBeUndefined();

    expect(JSON.parse(localStorage.getItem(key))).toEqual(previous);
    await expect(LeakRepository.getAll(PROJECT)).resolves.toMatchObject([
      { id: "current" },
    ]);
  });

  it("selects a newer localStorage revision and repairs stale IndexedDB", async () => {
    const { LeakRepository } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("previous")], PROJECT);
    const previous = readLocalEnvelope(PROJECT.projectId);
    const current = [makeLeak("current")];
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
    localStorage.removeItem(storageKey(PROJECT.projectId));
    await expect(LeakRepository.getAll(PROJECT)).resolves.toMatchObject([
      { id: "current" },
    ]);
  });

  it("keeps a newer IndexedDB revision when the local mirror is stale", async () => {
    const { LeakRepository } = await loadRepository();
    await LeakRepository.saveAll([makeLeak("previous")], PROJECT);
    const stale = readLocalEnvelope(PROJECT.projectId);
    await LeakRepository.saveAll([makeLeak("current")], PROJECT);
    localStorage.setItem(storageKey(PROJECT.projectId), JSON.stringify(stale));

    await expect(LeakRepository.getAll(PROJECT)).resolves.toMatchObject([
      { id: "current" },
    ]);
    expect(readLocalEnvelope(PROJECT.projectId).data).toMatchObject([
      { id: "current" },
    ]);
  });

  it("uses a newer IndexedDB tombstone when the local mirror cannot be updated", async () => {
    const { LeakRepository } = await loadRepository();
    const key = storageKey(PROJECT.projectId);
    await LeakRepository.saveAll([makeLeak("previous")], PROJECT);
    failLocalStorageWritesFor(key);

    await expect(LeakRepository.clear(PROJECT)).resolves.toBeUndefined();
    await expect(LeakRepository.getAll(PROJECT)).resolves.toEqual([]);
  });

  it("rejects the save and preserves the mirror when both web stores fail", async () => {
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
    expect(JSON.parse(localStorage.getItem(key))).toEqual(previous);
  });
});
