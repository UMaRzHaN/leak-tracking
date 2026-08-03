import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeState = vi.hoisted(() => ({
  projects: new Map(),
  files: new Map(),
  unavailable: false,
  failNext: null,
  failMarkerWrite: false,
}));

function diagnostics(project) {
  return {
    found: Boolean(project),
    recordCount: project?.records.length ?? 0,
    lastWriteMode: project?.lastWriteMode ?? null,
    lastChangeCount: project?.lastChangeCount ?? 0,
    databaseBytes: project ? JSON.stringify(project.records).length : 0,
    walBytes: 0,
  };
}

const sqlitePlugin = vi.hoisted(() => ({
  load: vi.fn(async ({ projectKey }) => {
    if (nativeState.unavailable) throw new Error("Plugin is not available");
    if (nativeState.failNext) throw nativeState.failNext;
    const project = nativeState.projects.get(projectKey);
    return {
      found: Boolean(project),
      recordsJson: JSON.stringify(project?.records ?? []),
      syncStateJson:
        project?.syncState == null ? null : JSON.stringify(project.syncState),
      ...diagnostics(project),
    };
  }),
  replaceAll: vi.fn(async ({ projectKey, recordsJson, syncStateJson }) => {
    if (nativeState.unavailable) throw new Error("Plugin is not available");
    if (nativeState.failNext) {
      const error = nativeState.failNext;
      nativeState.failNext = null;
      throw error;
    }
    const project = {
      records: JSON.parse(recordsJson),
      syncState: syncStateJson == null ? null : JSON.parse(syncStateJson),
      lastWriteMode: "replace",
      lastChangeCount: JSON.parse(recordsJson).length,
    };
    nativeState.projects.set(projectKey, project);
    return diagnostics(project);
  }),
  applyChanges: vi.fn(
    async ({ projectKey, upsertsJson, deletedIdsJson, syncStateJson }) => {
      if (nativeState.unavailable) throw new Error("Plugin is not available");
      if (nativeState.failNext) {
        const error = nativeState.failNext;
        nativeState.failNext = null;
        throw error;
      }
      const project = nativeState.projects.get(projectKey);
      if (!project) return { projectMissing: true };
      const upserts = JSON.parse(upsertsJson);
      const deletedIds = new Set(JSON.parse(deletedIdsJson).map(String));
      const map = new Map(
        project.records
          .filter((record) => !deletedIds.has(String(record.id)))
          .map((record) => [String(record.id), record]),
      );
      const order = [...map.keys()];
      for (const record of upserts) {
        const id = String(record.id);
        if (!map.has(id)) order.push(id);
        map.set(id, record);
      }
      project.records = order.map((id) => map.get(id));
      project.syncState =
        syncStateJson == null ? null : JSON.parse(syncStateJson);
      project.lastWriteMode = "incremental";
      project.lastChangeCount = upserts.length + deletedIds.size;
      return diagnostics(project);
    },
  ),
  diagnostics: vi.fn(async ({ projectKey }) =>
    diagnostics(nativeState.projects.get(projectKey)),
  ),
  deleteProject: vi.fn(async ({ projectKey }) => {
    nativeState.projects.delete(projectKey);
  }),
}));

vi.mock("@/utils/platform", () => ({ isNative: true }));
vi.mock("@capacitor/core", () => ({
  registerPlugin: vi.fn(() => sqlitePlugin),
}));
vi.mock("@capacitor/filesystem", () => ({
  Encoding: { UTF8: "utf8" },
  Directory: { Data: "DATA", Documents: "DOCUMENTS" },
  Filesystem: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(async ({ path, directory }) => {
      const key = directory === "DOCUMENTS" ? `DOCUMENTS:${path}` : path;
      if (!nativeState.files.has(key)) throw new Error("File does not exist");
      return { data: nativeState.files.get(key) };
    }),
    stat: vi.fn(async ({ path, directory }) => {
      const key = directory === "DOCUMENTS" ? `DOCUMENTS:${path}` : path;
      if (!nativeState.files.has(key)) throw new Error("File does not exist");
      return { size: String(nativeState.files.get(key)).length };
    }),
    writeFile: vi.fn(async ({ path, data, directory }) => {
      if (nativeState.failMarkerWrite && path.endsWith("data.sqlite.json")) {
        throw new Error("marker write failed");
      }
      const key = directory === "DOCUMENTS" ? `DOCUMENTS:${path}` : path;
      nativeState.files.set(key, data);
    }),
    appendFile: vi.fn(async ({ path, data, directory }) => {
      const key = directory === "DOCUMENTS" ? `DOCUMENTS:${path}` : path;
      nativeState.files.set(key, `${nativeState.files.get(key) ?? ""}${data}`);
    }),
    copy: vi.fn(async ({ from, to, directory, toDirectory }) => {
      const fromKey = directory === "DOCUMENTS" ? `DOCUMENTS:${from}` : from;
      const toKey =
        (toDirectory ?? directory) === "DOCUMENTS" ? `DOCUMENTS:${to}` : to;
      if (!nativeState.files.has(fromKey))
        throw new Error("File does not exist");
      nativeState.files.set(toKey, nativeState.files.get(fromKey));
    }),
    deleteFile: vi.fn(async ({ path, directory }) => {
      const key = directory === "DOCUMENTS" ? `DOCUMENTS:${path}` : path;
      if (!nativeState.files.delete(key))
        throw new Error("File does not exist");
    }),
    rename: vi.fn(async ({ from, to, directory, toDirectory }) => {
      const fromKey = directory === "DOCUMENTS" ? `DOCUMENTS:${from}` : from;
      const toKey =
        (toDirectory ?? directory) === "DOCUMENTS" ? `DOCUMENTS:${to}` : to;
      if (!nativeState.files.has(fromKey))
        throw new Error("File does not exist");
      nativeState.files.set(toKey, nativeState.files.get(fromKey));
      nativeState.files.delete(fromKey);
    }),
  },
}));

const { LeakRepository, getEmbeddedProjectSyncState } =
  await import("./LeakRepository");
const { resetNativeStorageStrategyForTests } =
  await import("./nativeLeakStorage");

const project = { projectId: "p1", folderName: "alpha" };

beforeEach(() => {
  nativeState.projects.clear();
  nativeState.files.clear();
  nativeState.unavailable = false;
  nativeState.failNext = null;
  nativeState.failMarkerWrite = false;
  resetNativeStorageStrategyForTests();
  vi.clearAllMocks();
});

describe("LeakRepository Android SQLite storage", () => {
  it("updates only changed rows for an ordinary edit", async () => {
    const previous = [
      { id: "a", status: "open", value: 1 },
      { id: "b", status: "open", value: 1 },
    ];
    const current = [{ ...previous[0], value: 2 }, previous[1]];
    await LeakRepository.saveAll(previous, project);
    vi.clearAllMocks();

    await LeakRepository.saveAll(current, {
      ...project,
      previousLeaks: previous,
    });

    expect(sqlitePlugin.applyChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        upsertsJson: JSON.stringify([current[0]]),
        deletedIdsJson: "[]",
      }),
    );
    expect(sqlitePlugin.replaceAll).not.toHaveBeenCalled();
    await expect(LeakRepository.getAll(project)).resolves.toEqual(current);
  });

  it("applies deletion and append atomically while preserving order", async () => {
    const previous = [
      { id: "a", status: "open" },
      { id: "b", status: "open" },
    ];
    const current = [previous[0], { id: "c", status: "open" }];
    await LeakRepository.saveAll(previous, project);
    await LeakRepository.saveAll(current, {
      ...project,
      previousLeaks: previous,
    });

    await expect(LeakRepository.getAll(project)).resolves.toEqual(current);
    expect(sqlitePlugin.applyChanges).toHaveBeenLastCalledWith(
      expect.objectContaining({
        upsertsJson: JSON.stringify([current[1]]),
        deletedIdsJson: JSON.stringify(["b"]),
      }),
    );
  });

  it("uses a full transaction for reordering and large replacements", async () => {
    const previous = Array.from({ length: 1000 }, (_, index) => ({
      id: String(index),
      status: "open",
      value: 0,
    }));
    await LeakRepository.saveAll(previous, project);
    vi.clearAllMocks();

    const reordered = [previous[1], previous[0], ...previous.slice(2)];
    await LeakRepository.saveAll(reordered, {
      ...project,
      previousLeaks: previous,
    });
    expect(sqlitePlugin.replaceAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    const changed = reordered.map((record, index) =>
      index < 600 ? { ...record, value: 1 } : record,
    );
    await LeakRepository.saveAll(changed, {
      ...project,
      previousLeaks: reordered,
    });
    expect(sqlitePlugin.replaceAll).toHaveBeenCalledOnce();
  });

  it("purges the SQLite project instead of leaving an empty database row", async () => {
    await LeakRepository.saveAll([{ id: "remove", status: "open" }], project);

    await LeakRepository.purge(project);

    expect(sqlitePlugin.deleteProject).toHaveBeenCalledWith({
      projectKey: "alpha",
    });
    expect(nativeState.projects.has("alpha")).toBe(false);
  });

  it("stores sync state in the same SQLite transaction", async () => {
    const syncState = {
      version: 2,
      epochId: "sqlite",
      deleted: { "id:removed": 700 },
    };
    await LeakRepository.saveAll([{ id: "current", status: "open" }], {
      ...project,
      syncState,
    });

    const result = await LeakRepository.getAll(project);
    expect(result).toEqual([{ id: "current", status: "open" }]);
    expect(getEmbeddedProjectSyncState(result)).toEqual(syncState);
  });

  it("migrates snapshot plus journal to SQLite without deleting recovery files", async () => {
    const mainPath = "LeakReports/alpha/data/data.json";
    const backupPath = "LeakReports/alpha/data/data.backup.json";
    const journalPath = "LeakReports/alpha/data/data.journal.jsonl";
    const snapshotId = "snapshot-1";
    const baseline = JSON.stringify({
      version: 3,
      snapshotId,
      data: [{ id: "a", status: "open", value: 1 }],
      syncState: { revision: 1 },
    });
    nativeState.files.set(mainPath, baseline);
    nativeState.files.set(backupPath, baseline);
    nativeState.files.set(
      journalPath,
      `${JSON.stringify({
        version: 1,
        snapshotId,
        upserts: [{ id: "a", status: "open", value: 2 }],
        deletedIds: [],
        syncState: { revision: 2 },
      })}\n`,
    );

    const result = await LeakRepository.getAll(project);

    expect(result).toEqual([{ id: "a", status: "open", value: 2 }]);
    expect(getEmbeddedProjectSyncState(result)).toEqual({ revision: 2 });
    expect(sqlitePlugin.replaceAll).toHaveBeenCalledOnce();
    expect(nativeState.files.get(mainPath)).toBe(baseline);
    expect(nativeState.files.has(journalPath)).toBe(true);
  });

  it("migrates an explicit old project-type file into SQLite", async () => {
    const legacyPath = "LeakReports/upstream/data/upstream.json";
    const legacyData = JSON.stringify([{ id: "legacy", status: "open" }]);
    nativeState.files.set(legacyPath, legacyData);

    await expect(
      LeakRepository.getAll({
        projectId: "1234",
        folderName: "North_Field",
        legacyStorageType: "upstream",
      }),
    ).resolves.toEqual([{ id: "legacy", status: "open" }]);

    expect(nativeState.files.get(legacyPath)).toBe(legacyData);
    expect(nativeState.projects.get("North_Field").records[0].id).toBe(
      "legacy",
    );
  });

  it("surfaces malformed legacy data without creating a SQLite project", async () => {
    const legacyPath = "LeakReports/downstream/data/downstream.json";
    nativeState.files.set(legacyPath, "{broken");

    await expect(
      LeakRepository.getAll({
        projectId: "9012",
        folderName: "Refinery",
        legacyStorageType: "downstream",
      }),
    ).rejects.toMatchObject({
      code: "PROJECT_DATA_READ_FAILED",
      source: "native-legacy",
    });
    expect(nativeState.projects.has("Refinery")).toBe(false);
    expect(nativeState.files.get(legacyPath)).toBe("{broken");
  });

  it("does not probe old project-type paths without an explicit marker", async () => {
    nativeState.files.set(
      "LeakReports/upstream/data/upstream.json",
      JSON.stringify([{ id: "legacy", status: "open" }]),
    );

    await expect(
      LeakRepository.getAll({ projectId: "new", folderName: "empty" }),
    ).resolves.toEqual([]);
    expect(nativeState.projects.has("empty")).toBe(false);
  });

  it("fails closed when the SQLite migration marker cannot be persisted", async () => {
    nativeState.failMarkerWrite = true;

    await expect(
      LeakRepository.saveAll([{ id: "stored", status: "open" }], project),
    ).rejects.toMatchObject({
      code: "SQLITE_MARKER_WRITE_FAILED",
    });
    expect(nativeState.projects.get("alpha").records[0].id).toBe("stored");
    expect(nativeState.files.has("LeakReports/alpha/data/data.json")).toBe(
      false,
    );
  });

  it("does not split writes between SQLite and legacy JSON after a database error", async () => {
    await LeakRepository.saveAll([{ id: "safe", status: "open" }], project);
    nativeState.failNext = new Error("database or disk is full");

    await expect(
      LeakRepository.saveAll([{ id: "changed", status: "open" }], project),
    ).rejects.toThrow("database or disk is full");
    expect(nativeState.files.has("LeakReports/alpha/data/data.json")).toBe(
      false,
    );
    expect(nativeState.projects.get("alpha").records[0].id).toBe("safe");
  });

  it("refuses a stale JSON fallback after SQLite migration", async () => {
    await LeakRepository.saveAll([{ id: "sqlite", status: "open" }], project);
    resetNativeStorageStrategyForTests();
    nativeState.unavailable = true;

    await expect(LeakRepository.getAll(project)).rejects.toMatchObject({
      code: "PROJECT_DATA_READ_FAILED",
      cause: expect.objectContaining({ code: "SQLITE_STORAGE_UNAVAILABLE" }),
    });
    expect(nativeState.files.has("LeakReports/alpha/data/data.json")).toBe(
      false,
    );
  });

  it("falls back to snapshot/journal only when the plugin is unavailable", async () => {
    nativeState.unavailable = true;
    await LeakRepository.saveAll([{ id: "legacy", status: "open" }], project);

    expect(nativeState.files.has("LeakReports/alpha/data/data.json")).toBe(
      true,
    );
    await expect(LeakRepository.getAll(project)).resolves.toEqual([
      { id: "legacy", status: "open" },
    ]);
  });
});
