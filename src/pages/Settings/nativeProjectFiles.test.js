import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  files: new Map(),
  failWrite: false,
}));

vi.mock("@capacitor/filesystem", () => ({
  Encoding: { UTF8: "utf8" },
  Directory: { Data: "DATA", Documents: "DOCUMENTS" },
  Filesystem: {
    rename: vi.fn(async ({ from, to, directory }) => {
      if (directory === "DOCUMENTS") return;
      const moved = [...state.files.entries()].filter(([path]) =>
        path.startsWith(`${from}/`),
      );
      if (!moved.length) throw new Error("missing folder");
      for (const [path, data] of moved) {
        state.files.delete(path);
        state.files.set(`${to}${path.slice(from.length)}`, data);
      }
    }),
    readFile: vi.fn(async ({ path }) => {
      if (!state.files.has(path)) throw new Error("missing file");
      return { data: state.files.get(path) };
    }),
    writeFile: vi.fn(async ({ path, data }) => {
      if (state.failWrite && path.includes("new_name")) {
        state.failWrite = false;
        throw new Error("disk full");
      }
      state.files.set(path, data);
    }),
  },
}));

const { renameNativeProjectFiles } = await import("./nativeProjectFiles");
const remapLeaks = (leaks, oldName, newName) =>
  leaks.map((leak) => ({
    ...leak,
    photo: leak.photo.replace(`/${oldName}/`, `/${newName}/`),
  }));

describe("renameNativeProjectFiles", () => {
  beforeEach(() => {
    state.files.clear();
    state.failWrite = false;
    state.files.set(
      "LeakReports/old_name/data/data.json",
      JSON.stringify([
        { id: 1, photo: "data://LeakReports/old_name/photos/a.jpg" },
      ]),
    );
  });

  it("renames the folder and remaps persisted photo paths", async () => {
    await expect(
      renameNativeProjectFiles({
        oldFolderName: "old_name",
        newFolderName: "new_name",
        remapLeaks,
      }),
    ).resolves.toEqual({ folderRenamed: true, dataRemapped: true });

    const stored = JSON.parse(
      state.files.get("LeakReports/new_name/data/data.json"),
    );
    expect(stored[0].photo).toContain("/new_name/");
  });

  it("preserves embedded sync state in versioned project payloads", async () => {
    const syncState = { version: 2, deleted: { "id:removed": 700 } };
    state.files.set(
      "LeakReports/old_name/data/data.json",
      JSON.stringify({
        version: 2,
        data: [{ id: 1, photo: "data://LeakReports/old_name/photos/a.jpg" }],
        syncState,
      }),
    );

    await renameNativeProjectFiles({
      oldFolderName: "old_name",
      newFolderName: "new_name",
      remapLeaks,
    });

    const stored = JSON.parse(
      state.files.get("LeakReports/new_name/data/data.json"),
    );
    expect(stored.data[0].photo).toContain("/new_name/");
    expect(stored.syncState).toEqual(syncState);
  });

  it("rolls the folder and file contents back when remapping cannot be written", async () => {
    const original = state.files.get("LeakReports/old_name/data/data.json");
    state.failWrite = true;

    await expect(
      renameNativeProjectFiles({
        oldFolderName: "old_name",
        newFolderName: "new_name",
        remapLeaks,
      }),
    ).resolves.toEqual({ folderRenamed: false, dataRemapped: false });

    expect(state.files.get("LeakReports/old_name/data/data.json")).toBe(
      original,
    );
    expect(state.files.has("LeakReports/new_name/data/data.json")).toBe(false);
  });
});
