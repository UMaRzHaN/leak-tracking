import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { STORAGE_KEYS } from "./storageKeys";

const platform = vi.hoisted(() => ({ isNative: false }));
const files = vi.hoisted(() => new Map());

vi.mock("@/utils/platform", () => ({
  get isNative() {
    return platform.isNative;
  },
}));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    mkdir: vi.fn(async () => {}),
    writeFile: vi.fn(async ({ path, data }) => files.set(path, data)),
    readFile: vi.fn(async ({ path }) => {
      if (!files.has(path)) throw new Error("File does not exist");
      return { data: files.get(path) };
    }),
    deleteFile: vi.fn(async ({ path }) => {
      if (!files.delete(path)) throw new Error("File does not exist");
    }),
    rename: vi.fn(async ({ from, to }) => {
      files.set(to, files.get(from));
      files.delete(from);
    }),
  },
}));

globalThis.indexedDB = new IDBFactory();

const { mirrorProjectList, readProjectListMirror, recoverMissingProjectList } =
  await import("./projectListMirror");
const { loadProjects, saveProjects, validateStoredProjects } =
  await import("./projectStorage");
const recover = () =>
  recoverMissingProjectList({ loadProjects, validateStoredProjects });

const project = {
  id: "p1",
  name: "Бузахур",
  type: "upstream",
  folderName: "Buzahur",
  createdAt: 1,
};

beforeEach(async () => {
  platform.isNative = false;
  files.clear();
  localStorage.clear();
  await mirrorProjectList([]);
});

describe("project list mirror", () => {
  it("keeps the last of several quick writes", async () => {
    mirrorProjectList([{ ...project, name: "first" }]);
    await mirrorProjectList([project]);

    await expect(readProjectListMirror()).resolves.toEqual([project]);
  });

  it("writes a whole file on the device, then swaps it in", async () => {
    platform.isNative = true;
    await mirrorProjectList([project]);

    expect(files.has("LeakReports/projects.backup.json.tmp")).toBe(false);
    await expect(readProjectListMirror()).resolves.toEqual([project]);
  });

  // Запись оборвалась между удалением старого файла и переименованием нового:
  // целая копия лежит во временном файле.
  it("reads the temporary file when the swap was interrupted", async () => {
    platform.isNative = true;
    files.set(
      "LeakReports/projects.backup.json.tmp",
      JSON.stringify({ list: [project] }),
    );

    await expect(readProjectListMirror()).resolves.toEqual([project]);
  });
});

describe("recoverMissingProjectList", () => {
  // Записи целы, а строка со списком пропала: без копии приложение открылось
  // бы как в первый раз, и все проекты остались бы невидимыми.
  it("brings back a list that vanished from localStorage", async () => {
    saveProjects([project]);
    await mirrorProjectList([project]);
    localStorage.removeItem(STORAGE_KEYS.PROJECTS_LIST);

    await expect(recover()).resolves.toEqual([project]);
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST)),
    ).toEqual([project]);
  });

  it("does not resurrect projects from an existing empty list", async () => {
    await mirrorProjectList([project]);
    localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, "[]");

    await expect(recover()).resolves.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST)).toBe("[]");
  });

  it("ignores a mirror that fails validation", async () => {
    await mirrorProjectList([{ ...project, folderName: ".." }]);

    await expect(recover()).resolves.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST)).toBeNull();
  });
});
