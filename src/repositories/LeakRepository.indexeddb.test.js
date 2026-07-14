import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

vi.mock("@/utils/platform", () => ({
  isNative: false,
}));

vi.mock("@capacitor/filesystem", () => ({
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

beforeEach(() => {
  localStorage.clear();
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

  it("clears IndexedDB project data", async () => {
    const { LeakRepository } = await loadRepository();

    await LeakRepository.saveAll([makeLeak("1")], PROJECT);
    localStorage.removeItem(storageKey(PROJECT.projectId));
    await LeakRepository.clear(PROJECT);

    await expect(LeakRepository.getAll(PROJECT)).resolves.toEqual([]);
  });
});
