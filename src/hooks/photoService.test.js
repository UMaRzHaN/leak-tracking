import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ isNative: false }));
const filesystem = vi.hoisted(() => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  deleteFile: vi.fn(),
  getUri: vi.fn(),
}));
const capacitor = vi.hoisted(() => ({ convertFileSrc: vi.fn() }));
const logger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }));

vi.mock("@/utils/platform", () => ({
  get isNative() {
    return platform.isNative;
  },
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: filesystem,
  Directory: { Data: "DATA", Documents: "DOCUMENTS" },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: capacitor }));
vi.mock("@/utils/logger", () => ({ logger }));

import { clearNativePhotoCache } from "@/services/storage/nativePhotoSourceCache";
import {
  deletePhotoFromFS,
  getPhotoBlob,
  getPhotoSrc,
  photoExists,
} from "./photoService";

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

describe("getPhotoBlob", () => {
  const PATH = "data://LeakReports/site/photos/photo_leak_h_abc.jpg";

  beforeEach(() => {
    platform.isNative = true;
    clearNativePhotoCache();
    vi.clearAllMocks();
    filesystem.getUri.mockResolvedValue({ uri: "file:///data/photo.jpg" });
    capacitor.convertFileSrc.mockReturnValue(
      "https://localhost/_capacitor_file_/data/photo.jpg",
    );
  });

  it("reads the file directly, without the base64 bridge", async () => {
    const bytes = new Blob(["photo-bytes"], { type: "image/jpeg" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, blob: async () => bytes })),
    );

    const blob = await getPhotoBlob(PATH);

    expect(await blob.text()).toBe("photo-bytes");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://localhost/_capacitor_file_/data/photo.jpg",
    );
    expect(filesystem.readFile).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("labels a typeless response as an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => new Blob(["bytes"]),
      })),
    );

    await expect(getPhotoBlob(PATH)).resolves.toMatchObject({
      type: "image/jpeg",
    });
    vi.unstubAllGlobals();
  });

  it("falls back to the base64 read when the direct read fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    filesystem.readFile.mockResolvedValue({ data: btoa("fallback-bytes") });

    const blob = await getPhotoBlob(PATH);

    expect(await blob.text()).toBe("fallback-bytes");
    expect(filesystem.readFile).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("falls back when the direct read returns an empty file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => new Blob([]),
      })),
    );
    filesystem.readFile.mockResolvedValue({ data: btoa("recovered") });

    await expect((await getPhotoBlob(PATH)).text()).resolves.toBe("recovered");
    vi.unstubAllGlobals();
  });

  it("ignores paths outside the app photo folder and the web platform", async () => {
    await expect(getPhotoBlob("data://../escape.jpg")).resolves.toBe(null);
    platform.isNative = false;
    await expect(getPhotoBlob(PATH)).resolves.toBe(null);
    expect(filesystem.getUri).not.toHaveBeenCalled();
  });
});
