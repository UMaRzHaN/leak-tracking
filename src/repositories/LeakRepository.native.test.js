import { beforeEach, describe, expect, it, vi } from "vitest";

const fsState = vi.hoisted(() => ({ files: new Map(), failRename: false }));

vi.mock("@/utils/platform", () => ({ isNative: true }));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA", Documents: "DOCUMENTS" },
  Filesystem: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(async ({ path, directory }) => {
      const key = directory === "DOCUMENTS" ? `DOCUMENTS:${path}` : path;
      if (!fsState.files.has(key)) throw new Error("File does not exist");
      return { data: fsState.files.get(key) };
    }),
    writeFile: vi.fn(async ({ path, data, directory }) => {
      const key = directory === "DOCUMENTS" ? `DOCUMENTS:${path}` : path;
      fsState.files.set(key, data);
    }),
    copy: vi.fn(async ({ from, to, directory, toDirectory }) => {
      const fromKey = directory === "DOCUMENTS" ? `DOCUMENTS:${from}` : from;
      const toKey =
        (toDirectory ?? directory) === "DOCUMENTS" ? `DOCUMENTS:${to}` : to;
      if (!fsState.files.has(fromKey)) throw new Error("File does not exist");
      fsState.files.set(toKey, fsState.files.get(fromKey));
    }),
    deleteFile: vi.fn(async ({ path, directory }) => {
      const key = directory === "DOCUMENTS" ? `DOCUMENTS:${path}` : path;
      if (!fsState.files.delete(key)) throw new Error("File does not exist");
    }),
    rename: vi.fn(async ({ from, to, directory, toDirectory }) => {
      if (fsState.failRename) throw new Error("rename failed");
      const fromKey = directory === "DOCUMENTS" ? `DOCUMENTS:${from}` : from;
      const toKey =
        (toDirectory ?? directory) === "DOCUMENTS" ? `DOCUMENTS:${to}` : to;
      if (!fsState.files.has(fromKey)) throw new Error("File does not exist");
      fsState.files.set(toKey, fsState.files.get(fromKey));
      fsState.files.delete(fromKey);
    }),
  },
}));

const { LeakRepository } = await import("./LeakRepository");

const project = { projectId: "p1", folderName: "alpha" };
const mainPath = "LeakReports/alpha/data/data.json";
const backupPath = "LeakReports/alpha/data/data.backup.json";

beforeEach(() => {
  fsState.files.clear();
  fsState.failRename = false;
  vi.clearAllMocks();
});

describe("LeakRepository native recovery", () => {
  it("keeps the previous valid dataset and recovers it when main JSON is corrupt", async () => {
    await LeakRepository.saveAll([{ id: "old", status: "open" }], project);
    await LeakRepository.saveAll([{ id: "new", status: "open" }], project);

    expect(JSON.parse(fsState.files.get(backupPath))[0].id).toBe("old");
    fsState.files.set(mainPath, "{corrupt-json");

    await expect(LeakRepository.getAll(project)).resolves.toEqual([
      expect.objectContaining({ id: "old" }),
    ]);
  });

  it("restores the current dataset if the final rename fails", async () => {
    await LeakRepository.saveAll([{ id: "safe", status: "open" }], project);
    fsState.failRename = true;

    await expect(
      LeakRepository.saveAll([{ id: "lost", status: "open" }], project),
    ).rejects.toThrow("rename failed");

    expect(JSON.parse(fsState.files.get(mainPath))[0].id).toBe("safe");
  });

  it("copies an older Directory.Data project-type file without deleting it", async () => {
    const legacyPath = "LeakReports/upstream/data/upstream.json";
    const legacyData = JSON.stringify([{ id: "legacy", status: "open" }]);
    fsState.files.set(legacyPath, legacyData);

    await expect(
      LeakRepository.getAll({
        projectId: "1234",
        folderName: "North_Field",
        legacyStorageType: "upstream",
      }),
    ).resolves.toEqual([expect.objectContaining({ id: "legacy" })]);

    expect(fsState.files.get(legacyPath)).toBe(legacyData);
    expect(
      JSON.parse(fsState.files.get("LeakReports/North_Field/data/data.json"))[0]
        .id,
    ).toBe("legacy");
  });

  it("recovers the legacy data.json from Directory.Documents", async () => {
    const legacyPath = "LeakReports/midstream/data/data.json";
    const legacyData = JSON.stringify([{ id: "documents", status: "open" }]);
    fsState.files.set(`DOCUMENTS:${legacyPath}`, legacyData);

    await expect(
      LeakRepository.getAll({
        projectId: "5678",
        folderName: "Pipeline",
        legacyStorageType: "midstream",
      }),
    ).resolves.toEqual([expect.objectContaining({ id: "documents" })]);

    expect(fsState.files.get(`DOCUMENTS:${legacyPath}`)).toBe(legacyData);
    expect(
      JSON.parse(fsState.files.get("LeakReports/Pipeline/data/data.json"))[0]
        .id,
    ).toBe("documents");
  });

  it("surfaces malformed legacy native data and preserves its source", async () => {
    const legacyPath = "LeakReports/downstream/data/downstream.json";
    fsState.files.set(legacyPath, "{broken");

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

    expect(fsState.files.get(legacyPath)).toBe("{broken");
    expect(fsState.files.has("LeakReports/Refinery/data/data.json")).toBe(
      false,
    );
  });

  it("does not probe legacy paths without the explicit migration marker", async () => {
    const legacyPath = "LeakReports/upstream/data/upstream.json";
    fsState.files.set(
      legacyPath,
      JSON.stringify([{ id: "legacy", status: "open" }]),
    );

    await expect(
      LeakRepository.getAll({
        projectId: "new-project",
        folderName: "empty",
      }),
    ).resolves.toEqual([]);

    expect(fsState.files.has("LeakReports/empty/data/data.json")).toBe(false);
  });
});
