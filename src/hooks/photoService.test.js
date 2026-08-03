import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ isNative: false }));
const filesystem = vi.hoisted(() => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  deleteFile: vi.fn(),
}));
const logger = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/utils/platform", () => ({
  get isNative() {
    return platform.isNative;
  },
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: filesystem,
  Directory: { Data: "DATA", Documents: "DOCUMENTS" },
}));
vi.mock("@/utils/logger", () => ({ logger }));

import { clearNativePhotoCache } from "@/services/storage/nativePhotoSourceCache";
import { deletePhotoFromFS, getPhotoSrc, photoExists } from "./photoService";

describe("photoService", () => {
  beforeEach(() => {
    platform.isNative = false;
    clearNativePhotoCache();
    vi.clearAllMocks();
  });

  it("uses browser-native photo values without filesystem access", async () => {
    const dataUrl = "data:image/jpeg;base64,abc";
    expect(await getPhotoSrc(dataUrl)).toBe(dataUrl);
    expect(await photoExists(dataUrl)).toBe(true);
    expect(await photoExists("https://example.test/photo.jpg")).toBe(false);
    await deletePhotoFromFS(dataUrl);
    expect(filesystem.deleteFile).not.toHaveBeenCalled();
  });

  it("reads current data paths and legacy document paths on native", async () => {
    platform.isNative = true;
    filesystem.readFile.mockResolvedValue({ data: "encoded" });

    expect(await getPhotoSrc("data://LeakReports/current.jpg")).toBe(
      "data:image/jpeg;base64,encoded",
    );
    expect(filesystem.readFile).toHaveBeenLastCalledWith({
      path: "LeakReports/current.jpg",
      directory: "DATA",
    });

    await getPhotoSrc("Documents/LeakReports/legacy.jpg");
    expect(filesystem.readFile).toHaveBeenLastCalledWith({
      path: "LeakReports/legacy.jpg",
      directory: "DOCUMENTS",
    });
  });

  it("reuses cached native photo data on repeated database renders", async () => {
    platform.isNative = true;
    filesystem.readFile.mockResolvedValue({ data: "cached" });
    const path = "data://LeakReports/cache/photos/photo.jpg";

    expect(await getPhotoSrc(path)).toBe("data:image/jpeg;base64,cached");
    expect(await getPhotoSrc(path)).toBe("data:image/jpeg;base64,cached");
    expect(filesystem.readFile).toHaveBeenCalledOnce();
  });

  it("invalidates a cached native photo after filesystem deletion", async () => {
    platform.isNative = true;
    filesystem.readFile
      .mockResolvedValueOnce({ data: "before-delete" })
      .mockResolvedValueOnce({ data: "after-delete" });
    filesystem.deleteFile.mockResolvedValue(undefined);
    const path = "data://LeakReports/cache/photos/deleted.jpg";

    expect(await getPhotoSrc(path)).toBe(
      "data:image/jpeg;base64,before-delete",
    );
    await deletePhotoFromFS(path);
    expect(await getPhotoSrc(path)).toBe("data:image/jpeg;base64,after-delete");

    expect(filesystem.readFile).toHaveBeenCalledTimes(2);
  });

  it("invalidates cached native data even when the file is already missing", async () => {
    platform.isNative = true;
    filesystem.readFile
      .mockResolvedValueOnce({ data: "cached-before-missing-delete" })
      .mockResolvedValueOnce({ data: "fresh-after-missing-delete" });
    filesystem.deleteFile.mockRejectedValueOnce(new Error("missing"));
    const path = "data://LeakReports/cache/photos/already-missing.jpg";

    await getPhotoSrc(path);
    await deletePhotoFromFS(path);
    expect(await getPhotoSrc(path)).toBe(
      "data:image/jpeg;base64,fresh-after-missing-delete",
    );
    expect(filesystem.readFile).toHaveBeenCalledTimes(2);
  });

  it("limits concurrent native photo reads to protect the Android bridge", async () => {
    platform.isNative = true;
    const resolvers = [];
    filesystem.readFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const reads = Array.from({ length: 5 }, (_, index) =>
      getPhotoSrc(`data://LeakReports/project/photos/photo-${index}.jpg`),
    );

    await vi.waitFor(() =>
      expect(filesystem.readFile).toHaveBeenCalledTimes(3),
    );
    resolvers.shift()({ data: "first" });
    await vi.waitFor(() =>
      expect(filesystem.readFile).toHaveBeenCalledTimes(4),
    );

    while (resolvers.length > 0) {
      resolvers.shift()({ data: "next" });
      await Promise.resolve();
    }
    await vi.waitFor(() =>
      expect(filesystem.readFile).toHaveBeenCalledTimes(5),
    );
    while (resolvers.length > 0) {
      resolvers.shift()({ data: "last" });
      await Promise.resolve();
    }

    await expect(Promise.all(reads)).resolves.toHaveLength(5);
  });

  it("returns safe fallbacks when native files are missing", async () => {
    platform.isNative = true;
    filesystem.readFile.mockRejectedValue(new Error("missing"));
    filesystem.stat.mockRejectedValue(new Error("missing"));

    expect(
      await getPhotoSrc("data://LeakReports/missing/photos/missing.jpg"),
    ).toBeNull();
    expect(
      await photoExists("data://LeakReports/missing/photos/missing.jpg"),
    ).toBe(false);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("checks and deletes native photos in their correct directory", async () => {
    platform.isNative = true;
    filesystem.stat.mockResolvedValue({ type: "file" });
    filesystem.deleteFile.mockResolvedValue(undefined);

    expect(
      await photoExists("data://LeakReports/folder/photos/photo.jpg"),
    ).toBe(true);
    await deletePhotoFromFS("data://LeakReports/folder/photos/photo.jpg");
    expect(filesystem.stat).toHaveBeenCalledWith({
      path: "LeakReports/folder/photos/photo.jpg",
      directory: "DATA",
    });
    expect(filesystem.deleteFile).toHaveBeenCalledWith({
      path: "LeakReports/folder/photos/photo.jpg",
      directory: "DATA",
    });
  });

  it("rejects native paths outside the photo storage root", async () => {
    platform.isNative = true;

    expect(
      await getPhotoSrc(
        "data://LeakReports/project/photos/../../../private/data.json",
      ),
    ).toBeNull();
    expect(await photoExists("Documents/../private/photo.jpg")).toBe(false);
    await deletePhotoFromFS(
      "Documents/LeakReports/project/photos/../../data/data.json",
    );

    expect(filesystem.readFile).not.toHaveBeenCalled();
    expect(filesystem.stat).not.toHaveBeenCalled();
    expect(filesystem.deleteFile).not.toHaveBeenCalled();
  });
});
