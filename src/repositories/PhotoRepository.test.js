import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compressImage: vi.fn(async (blob) => blob),
  getState: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  get: vi.fn(),
  listKeys: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({ isNative: false }));
vi.mock("@/repositories/compressImage", () => ({
  compressImage: mocks.compressImage,
}));
vi.mock("@/repositories/idb", () => ({
  idb: {
    getState: mocks.getState,
    save: mocks.save,
    remove: mocks.remove,
    get: mocks.get,
    listKeys: mocks.listKeys,
  },
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { mkdir: mocks.mkdir },
  Directory: { Data: "DATA" },
}));

const { PhotoRepository } = await import("./PhotoRepository");
const { markPhotoPrepared } = await import("@/utils/photoPreparation");

describe("PhotoRepository on web", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getState.mockReturnValue({ ready: true });
    mocks.save.mockResolvedValue(true);
    mocks.remove.mockResolvedValue(true);
    mocks.listKeys.mockResolvedValue([]);
  });

  it("saves a compressed blob and preserves excluded old versions", async () => {
    vi.spyOn(Date, "now").mockReturnValue(500);
    mocks.listKeys.mockResolvedValue([
      "photo_project_leak_100",
      "photo_project_leak_200",
      "photo_other_leak_100",
    ]);
    const blob = new Blob(["photo"], { type: "image/jpeg" });

    const path = await PhotoRepository.save(
      blob,
      { projectId: "project", leakId: "leak" },
      ["idb://photo_project_leak_200"],
    );

    expect(path).toBe("idb://photo_project_leak_500");
    expect(mocks.compressImage).toHaveBeenCalledWith(blob);
    expect(mocks.save).toHaveBeenCalledWith("photo_project_leak_500", blob);
    expect(mocks.remove).toHaveBeenCalledWith("photo_project_leak_100");
    expect(mocks.remove).not.toHaveBeenCalledWith("photo_project_leak_200");
  });

  it("does not recompress a prepared photo or scan when cleanup is disabled", async () => {
    const blob = markPhotoPrepared(
      new Blob(["prepared"], { type: "image/jpeg" }),
    );

    const path = await PhotoRepository.save(
      blob,
      { projectId: "project", leakId: "new" },
      [],
      { cleanupOldVersions: false },
    );

    expect(path).toMatch(/^idb:\/\/photo_project_new_\d+$/);
    expect(mocks.compressImage).not.toHaveBeenCalled();
    expect(mocks.listKeys).not.toHaveBeenCalled();
  });

  it("rejects invalid or unavailable web storage inputs", async () => {
    expect(
      await PhotoRepository.save(null, {
        projectId: "project",
        leakId: "leak",
      }),
    ).toBeNull();
    expect(
      await PhotoRepository.save("not-a-blob", {
        projectId: "project",
        leakId: "leak",
      }),
    ).toBeNull();

    mocks.getState.mockReturnValue({ ready: false });
    expect(
      await PhotoRepository.save(new Blob(["x"]), {
        projectId: "project",
        leakId: "leak",
      }),
    ).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("delegates get, list and idb deletion only while storage is ready", async () => {
    mocks.get.mockResolvedValue("stored-photo");
    mocks.listKeys.mockResolvedValue(["a", "b"]);

    await expect(PhotoRepository.get("key")).resolves.toBe("stored-photo");
    await expect(PhotoRepository.listKeys()).resolves.toEqual(["a", "b"]);
    await PhotoRepository.delete("idb://key");
    expect(mocks.remove).toHaveBeenCalledWith("key");

    mocks.getState.mockReturnValue({ ready: false });
    await expect(PhotoRepository.get("key")).resolves.toBeNull();
    await PhotoRepository.delete("idb://ignored");
    expect(mocks.remove).not.toHaveBeenCalledWith("ignored");
  });

  it("deletes only photos belonging to the requested project", async () => {
    mocks.listKeys.mockResolvedValue([
      "photo_project_1_100",
      "photo_project_2_200",
      "photo_other_1_100",
    ]);

    await PhotoRepository.deleteProjectPhotos("project", "unused-on-web");

    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.remove).not.toHaveBeenCalledWith("photo_other_1_100");
  });

  it("garbage-collects orphaned photos but keeps all supported references", async () => {
    mocks.listKeys.mockResolvedValue([
      "photo_project_original",
      "photo_project_after",
      "photo_project_repair",
      "photo_project_monitoring",
      "photo_project_orphan",
      "photo_other_orphan",
    ]);
    const leaks = [
      {
        photo: "idb://photo_project_original",
        photo_after: "idb://photo_project_after",
        photo_repair: "idb://photo_project_repair",
        monitoringRecords: [{ photo: "idb://photo_project_monitoring" }, null],
      },
    ];

    await PhotoRepository.gcOrphaned(leaks, { projectId: "project" });

    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledWith("photo_project_orphan");
  });
});
