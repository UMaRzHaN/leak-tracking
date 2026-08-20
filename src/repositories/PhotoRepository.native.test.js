import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compressImage: vi.fn(async (blob) => blob),
  isWithinPhotoBudget: vi.fn(async () => false),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  stat: vi.fn(),
  invalidatePath: vi.fn(),
  invalidatePrefix: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({ isNative: true }));
vi.mock("@/repositories/compressImage", () => ({
  compressImage: mocks.compressImage,
  isWithinPhotoBudget: mocks.isWithinPhotoBudget,
}));
vi.mock("@/services/storage/nativePhotoSourceCache", () => ({
  invalidateNativePhotoCachePath: mocks.invalidatePath,
  invalidateNativePhotoCachePrefix: mocks.invalidatePrefix,
}));
vi.mock("@/repositories/idb", () => ({
  idb: {
    getState: vi.fn(() => ({ ready: false })),
    save: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
    listKeys: vi.fn(),
  },
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    mkdir: mocks.mkdir,
    readdir: mocks.readdir,
    writeFile: mocks.writeFile,
    deleteFile: mocks.deleteFile,
    stat: mocks.stat,
  },
  Directory: { Data: "DATA" },
}));

const { PhotoRepository, encodeStorageKeyPart } =
  await import("./PhotoRepository");

describe("PhotoRepository on Android", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.readdir.mockResolvedValue({ files: [] });
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.deleteFile.mockResolvedValue(undefined);
    mocks.stat.mockRejectedValue(new Error("not found"));
  });

  it("prepares each project folder once", async () => {
    await PhotoRepository.prepare({ folderName: "native_prepare_once" });
    await PhotoRepository.prepare({ folderName: "native_prepare_once" });

    expect(mocks.mkdir).toHaveBeenCalledOnce();
    expect(mocks.mkdir).toHaveBeenCalledWith({
      path: "LeakReports/native_prepare_once/photos",
      directory: "DATA",
      recursive: true,
    });
  });

  it("treats an existing photo folder as prepared", async () => {
    // @capacitor/filesystem 8 rejects mkdir on an existing directory even with
    // recursive: true, so every launch after the first one hit this path.
    mocks.mkdir.mockRejectedValue(
      Object.assign(
        new Error(
          "Directory at 'LeakReports/native_existing/photos' already exists, cannot be overwritten.",
        ),
        { code: "OS-PLUG-FILE-0010" },
      ),
    );

    await expect(
      PhotoRepository.prepare({ folderName: "native_existing" }),
    ).resolves.toBeUndefined();

    await expect(
      PhotoRepository.save(new Blob(["photo"], { type: "image/jpeg" }), {
        leakId: "leak",
        folderName: "native_existing",
      }),
    ).resolves.toMatch(/^data:\/\/LeakReports\/native_existing\/photos\//);
    expect(mocks.writeFile).toHaveBeenCalledOnce();
  });

  it("retries folder preparation after a mkdir failure", async () => {
    const error = new Error("mkdir failed");
    mocks.mkdir.mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);

    await expect(
      PhotoRepository.prepare({ folderName: "native_prepare_retry" }),
    ).rejects.toBe(error);
    await expect(
      PhotoRepository.prepare({ folderName: "native_prepare_retry" }),
    ).resolves.toBeUndefined();

    expect(mocks.mkdir).toHaveBeenCalledTimes(2);
  });

  it("writes a photo and removes stale versions except excluded files", async () => {
    vi.spyOn(Date, "now").mockReturnValue(700);
    mocks.readdir.mockResolvedValue({
      files: [
        { name: "photo_leak_100.jpg" },
        { name: "photo_leak_200.jpg" },
        { name: "photo_leak_monitoring_100.jpg" },
        { name: "photo_other_100.jpg" },
      ],
    });
    const blob = new Blob(["native-photo"], { type: "image/jpeg" });

    const path = await PhotoRepository.save(
      blob,
      { leakId: "leak", folderName: "native_save" },
      ["data://LeakReports/native_save/photos/photo_leak_200.jpg"],
    );

    expect(path).toBe(
      "data://LeakReports/native_save/photos/photo_leak_700.jpg",
    );
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "LeakReports/native_save/photos/photo_leak_700.jpg",
        directory: "DATA",
      }),
    );
    expect(mocks.deleteFile).toHaveBeenCalledOnce();
    expect(mocks.deleteFile).toHaveBeenCalledWith({
      directory: "DATA",
      path: "LeakReports/native_save/photos/photo_leak_100.jpg",
    });
    expect(mocks.invalidatePath).toHaveBeenCalledWith(
      "DATA",
      "LeakReports/native_save/photos/photo_leak_100.jpg",
    );
    expect(mocks.deleteFile).not.toHaveBeenCalledWith({
      directory: "DATA",
      path: "LeakReports/native_save/photos/photo_leak_monitoring_100.jpg",
    });
  });

  it("reuses a native content-addressed photo before compression", async () => {
    const hash = "b".repeat(64);
    const blob = new Blob(["duplicate"], { type: "image/jpeg" });
    mocks.stat.mockResolvedValue({ type: "file", size: 10 });

    const path = await PhotoRepository.save(
      blob,
      { leakId: "duplicate", folderName: "native_hash" },
      [],
      { contentHash: hash },
    );

    expect(path).toBe(
      `data://LeakReports/native_hash/photos/photo_duplicate_h_${hash}.jpg`,
    );
    expect(mocks.stat).toHaveBeenCalledWith({
      path: `LeakReports/native_hash/photos/photo_duplicate_h_${hash}.jpg`,
      directory: "DATA",
    });
    expect(mocks.compressImage).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("writes a photo already inside the budget without compressing it", async () => {
    vi.spyOn(Date, "now").mockReturnValue(900);
    mocks.isWithinPhotoBudget.mockResolvedValue(true);
    const blob = new Blob(["already-small"], { type: "image/jpeg" });

    const path = await PhotoRepository.save(blob, {
      leakId: "leak",
      folderName: "native_budget",
    });

    expect(path).toBe(
      "data://LeakReports/native_budget/photos/photo_leak_900.jpg",
    );
    expect(mocks.compressImage).not.toHaveBeenCalled();
    expect(mocks.writeFile).toHaveBeenCalledOnce();
  });

  it("keeps imported leak ids inside the native photo filename", async () => {
    vi.spyOn(Date, "now").mockReturnValue(800);
    const leakId = "../../victim\\\0_monitoring_part";
    const leakPart = encodeStorageKeyPart(leakId);
    const oldFileName = `photo_${leakPart}_700.jpg`;
    const nextFileName = `photo_${leakPart}_800.jpg`;
    mocks.readdir.mockResolvedValue({ files: [{ name: oldFileName }] });
    const blob = new Blob(["native-photo"], { type: "image/jpeg" });

    const path = await PhotoRepository.save(blob, {
      leakId,
      folderName: "native_safe",
    });

    expect(path).toBe(`data://LeakReports/native_safe/photos/${nextFileName}`);
    expect(nextFileName).not.toMatch(/[\\/]/);
    expect(nextFileName).not.toContain("\0");
    expect(nextFileName).not.toContain("..");
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `LeakReports/native_safe/photos/${nextFileName}`,
      }),
    );
    expect(mocks.deleteFile).toHaveBeenCalledWith({
      directory: "DATA",
      path: `LeakReports/native_safe/photos/${oldFileName}`,
    });
  });

  it("returns null for native saves without a folder or Blob", async () => {
    await expect(
      PhotoRepository.save(new Blob(["x"]), {
        leakId: "leak",
        folderName: "",
      }),
    ).resolves.toBeNull();
    await expect(
      PhotoRepository.save("not-a-blob", {
        leakId: "leak",
        folderName: "native_invalid",
      }),
    ).resolves.toBeNull();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("deletes scoped data paths and surfaces filesystem deletion errors", async () => {
    mocks.deleteFile.mockRejectedValueOnce(new Error("missing"));

    await expect(
      PhotoRepository.delete(
        "data://LeakReports/native_delete/photos/photo_1.jpg",
        { folderName: "native_delete" },
      ),
    ).rejects.toThrow("missing");
    expect(mocks.deleteFile).toHaveBeenCalledWith({
      directory: "DATA",
      path: "LeakReports/native_delete/photos/photo_1.jpg",
    });
    expect(mocks.invalidatePath).toHaveBeenCalledWith(
      "DATA",
      "LeakReports/native_delete/photos/photo_1.jpg",
    );

    await PhotoRepository.delete("data://LeakReports/victim/data/data.json", {
      folderName: "native_delete",
    });
    expect(mocks.deleteFile).not.toHaveBeenCalledWith({
      directory: "DATA",
      path: "LeakReports/victim/data/data.json",
    });
  });

  it("invalidates all cached photos when a native project is removed", async () => {
    await PhotoRepository.deleteProjectPhotos("project", "native_project");

    expect(mocks.invalidatePrefix).toHaveBeenCalledWith(
      "DATA",
      "LeakReports/native_project/photos/",
    );
  });

  it("garbage-collects only unreferenced native files", async () => {
    mocks.readdir.mockResolvedValue({
      files: [{ name: "kept.jpg" }, { name: "orphan.jpg" }],
    });
    const folder = "LeakReports/native_gc/photos";

    await PhotoRepository.gcOrphaned(
      [
        {
          monitoringRecords: [{ photo: `data://${folder}/kept.jpg` }],
        },
      ],
      { folderName: "native_gc" },
    );

    expect(mocks.deleteFile).toHaveBeenCalledOnce();
    expect(mocks.deleteFile).toHaveBeenCalledWith({
      directory: "DATA",
      path: `${folder}/orphan.jpg`,
    });
    expect(mocks.invalidatePath).toHaveBeenCalledWith(
      "DATA",
      `${folder}/orphan.jpg`,
    );
  });

  it("treats a missing photo folder as an empty folder during cleanup", async () => {
    mocks.readdir.mockRejectedValueOnce(new Error("missing folder"));

    await expect(
      PhotoRepository.gcOrphaned([], { folderName: "native_missing" }),
    ).resolves.toBeUndefined();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });
});
