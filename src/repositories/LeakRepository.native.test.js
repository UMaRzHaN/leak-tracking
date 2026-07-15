import { beforeEach, describe, expect, it, vi } from "vitest";

const fsState = vi.hoisted(() => ({ files: new Map(), failRename: false }));

vi.mock("@/utils/platform", () => ({ isNative: true }));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Filesystem: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(async ({ path }) => {
      if (!fsState.files.has(path)) throw new Error("File does not exist");
      return { data: fsState.files.get(path) };
    }),
    writeFile: vi.fn(async ({ path, data }) => {
      fsState.files.set(path, data);
    }),
    copy: vi.fn(async ({ from, to }) => {
      if (!fsState.files.has(from)) throw new Error("File does not exist");
      fsState.files.set(to, fsState.files.get(from));
    }),
    deleteFile: vi.fn(async ({ path }) => {
      if (!fsState.files.delete(path)) throw new Error("File does not exist");
    }),
    rename: vi.fn(async ({ from, to }) => {
      if (fsState.failRename) throw new Error("rename failed");
      if (!fsState.files.has(from)) throw new Error("File does not exist");
      fsState.files.set(to, fsState.files.get(from));
      fsState.files.delete(from);
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
});
