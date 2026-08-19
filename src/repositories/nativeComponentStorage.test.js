import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  projects: new Map(),
  unavailable: false,
  files: new Map(),
}));

const plugin = vi.hoisted(() => ({
  load: vi.fn(async ({ projectKey }) => {
    if (store.unavailable) throw new Error("Plugin is not available");
    const records = store.projects.get(projectKey);
    return {
      found: Boolean(records),
      recordsJson: JSON.stringify(records ?? []),
      syncStateJson: null,
    };
  }),
  replaceAll: vi.fn(async ({ projectKey, recordsJson }) => {
    if (store.unavailable) throw new Error("Plugin is not available");
    store.projects.set(projectKey, JSON.parse(recordsJson));
    return { ok: true };
  }),
  applyChanges: vi.fn(async ({ projectKey, upsertsJson, deletedIdsJson }) => {
    if (store.unavailable) throw new Error("Plugin is not available");
    const records = store.projects.get(projectKey);
    if (!records) return { projectMissing: true };

    const deleted = new Set(JSON.parse(deletedIdsJson));
    const next = records.filter((record) => !deleted.has(record.id));
    for (const upsert of JSON.parse(upsertsJson)) {
      const index = next.findIndex((record) => record.id === upsert.id);
      if (index === -1) next.push(upsert);
      else next[index] = upsert;
    }
    store.projects.set(projectKey, next);
    return { ok: true };
  }),
  deleteProject: vi.fn(async ({ projectKey }) => {
    if (store.unavailable) throw new Error("Plugin is not available");
    store.projects.delete(projectKey);
    return { ok: true };
  }),
}));

vi.mock("@capacitor/core", () => ({ registerPlugin: () => plugin }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    readFile: vi.fn(async ({ path }) => {
      if (!store.files.has(path)) {
        throw Object.assign(new Error("File does not exist"), {
          message: "File does not exist",
        });
      }
      return { data: store.files.get(path) };
    }),
    writeFile: vi.fn(async ({ path, data }) => store.files.set(path, data)),
    deleteFile: vi.fn(async ({ path }) => {
      if (!store.files.delete(path)) {
        throw new Error("File does not exist");
      }
    }),
    mkdir: vi.fn(async () => {}),
    stat: vi.fn(async () => ({})),
  },
}));

const {
  deleteNativeComponents,
  loadNativeComponents,
  resetNativeComponentStorageForTests,
  saveNativeComponents,
} = await import("./nativeComponentStorage");

const FOLDER = "buzahur";
const JSON_PATH = `LeakReports/${FOLDER}/data/components.json`;
const KEY = `components:${FOLDER}`;
const card = (id, extra = {}) => ({ id, component_uid: id, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  store.projects.clear();
  store.files.clear();
  store.unavailable = false;
  resetNativeComponentStorageForTests();
});

describe("the registry in the leaks' own store", () => {
  it("keeps its rows apart from a project of the same name", async () => {
    // Один файл на две базы, но ключи разные: иначе обход затёр бы утечки.
    await saveNativeComponents(FOLDER, [card("a")]);

    expect(store.projects.has(KEY)).toBe(true);
    expect(store.projects.has(FOLDER)).toBe(false);
  });

  it("writes one row for one edited card, not the whole walk", async () => {
    const walk = [card("a"), card("b"), card("c")];
    await saveNativeComponents(FOLDER, walk);
    plugin.replaceAll.mockClear();

    const edited = [walk[0], { ...walk[1], component: "Задвижка" }, walk[2]];
    await saveNativeComponents(FOLDER, edited, { previous: walk });

    expect(plugin.replaceAll).not.toHaveBeenCalled();
    expect(plugin.applyChanges).toHaveBeenCalledTimes(1);
    const [{ upsertsJson }] = plugin.applyChanges.mock.calls[0];
    expect(JSON.parse(upsertsJson)).toHaveLength(1);
    expect(await loadNativeComponents(FOLDER)).toHaveLength(3);
  });

  it("replaces the dataset when there is nothing to diff against", async () => {
    await saveNativeComponents(FOLDER, [card("a")]);

    expect(plugin.applyChanges).not.toHaveBeenCalled();
    expect(plugin.replaceAll).toHaveBeenCalledTimes(1);
  });

  it("drops a deleted card", async () => {
    const walk = [card("a"), card("b")];
    await saveNativeComponents(FOLDER, walk);

    await saveNativeComponents(FOLDER, [walk[0]], { previous: walk });

    expect(await loadNativeComponents(FOLDER)).toEqual([walk[0]]);
  });
});

describe("a walk recorded before the store existed", () => {
  it("is moved in once, and the file is kept", async () => {
    // Миграция, теряющая обход, хуже лишней копии обхода.
    store.files.set(
      JSON_PATH,
      JSON.stringify({ version: 1, data: [card("a"), card("b")] }),
    );

    const loaded = await loadNativeComponents(FOLDER);

    expect(loaded).toHaveLength(2);
    expect(store.projects.get(KEY)).toHaveLength(2);
    expect(store.files.has(JSON_PATH)).toBe(true);
  });

  it("still reads a bare array left by an older build", async () => {
    store.files.set(JSON_PATH, JSON.stringify([card("a")]));

    expect(await loadNativeComponents(FOLDER)).toHaveLength(1);
  });

  it("reads as empty when there has been no walk at all", async () => {
    expect(await loadNativeComponents(FOLDER)).toEqual([]);
  });
});

describe("a build without the plugin", () => {
  beforeEach(() => {
    store.unavailable = true;
  });

  it("writes the JSON file instead of failing the save", async () => {
    await saveNativeComponents(FOLDER, [card("a")]);

    expect(JSON.parse(store.files.get(JSON_PATH)).data).toHaveLength(1);
  });

  it("reads the same file back", async () => {
    await saveNativeComponents(FOLDER, [card("a")]);

    expect(await loadNativeComponents(FOLDER)).toHaveLength(1);
  });
});

describe("deleting a project's registry", () => {
  it("takes both the rows and the recovery file", async () => {
    store.files.set(JSON_PATH, JSON.stringify([card("a")]));
    await saveNativeComponents(FOLDER, [card("a")]);

    await deleteNativeComponents(FOLDER);

    expect(store.projects.has(KEY)).toBe(false);
    expect(store.files.has(JSON_PATH)).toBe(false);
  });

  it("reports success when there was nothing to delete", async () => {
    await expect(deleteNativeComponents(FOLDER)).resolves.toBe(true);
  });
});
