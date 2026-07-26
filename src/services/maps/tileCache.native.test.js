import { beforeEach, describe, expect, it, vi } from "vitest";

const { filesystem } = vi.hoisted(() => ({
  filesystem: {
    stat: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    rmdir: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

vi.mock("@/utils/platform", () => ({ isNative: true }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Filesystem: filesystem,
}));

const {
  cacheTile,
  clearMapCache,
  getMapCacheInfo,
  getTileBlobUrl,
  preloadUrls,
} = await import("./tileCache");

describe("tileCache native storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    filesystem.stat.mockRejectedValue(new Error("missing"));
    filesystem.mkdir.mockResolvedValue(undefined);
    filesystem.writeFile.mockResolvedValue(undefined);
    filesystem.rmdir.mockResolvedValue(undefined);
    filesystem.deleteFile.mockResolvedValue(undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:native-tile");
  });

  it("recovers from a corrupted or negative cached tile count", async () => {
    localStorage.setItem("map-tiles-native-count", "broken");
    await expect(getMapCacheInfo()).resolves.toEqual({ count: 0, sizeMB: 0 });

    localStorage.setItem("map-tiles-native-count", "-5");
    await expect(getMapCacheInfo()).resolves.toEqual({ count: 0, sizeMB: 0 });
  });

  it("reads a native tile and rejects malformed paths or read failures", async () => {
    filesystem.readFile.mockResolvedValue({ data: "AQID" });

    await expect(getTileBlobUrl("https://server/tile/3/2/1.jpg")).resolves.toBe(
      "blob:native-tile",
    );
    expect(filesystem.readFile).toHaveBeenCalledWith({
      path: "map-tiles/3/2/1.jpg",
      directory: "DATA",
    });

    await expect(getTileBlobUrl("not-a-tile")).resolves.toBeNull();
    filesystem.readFile.mockRejectedValue(new Error("broken file"));
    await expect(
      getTileBlobUrl("https://server/tile/3/2/1.jpg"),
    ).resolves.toBeNull();
  });

  it("stores a downloaded tile and updates native metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["tile"])),
      }),
    );

    await cacheTile("https://server/tile/3/2/1.jpg");

    expect(filesystem.mkdir).toHaveBeenCalledWith({
      path: "map-tiles/3/2",
      directory: "DATA",
      recursive: true,
    });
    expect(filesystem.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "map-tiles/3/2/1.jpg",
        directory: "DATA",
      }),
    );
    await expect(getMapCacheInfo()).resolves.toEqual({
      count: 1,
      sizeMB: 0,
    });
  });

  it("skips existing, malformed and failed native downloads", async () => {
    filesystem.stat.mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn());
    await cacheTile("https://server/tile/3/2/1.jpg");
    expect(fetch).not.toHaveBeenCalled();

    filesystem.stat.mockRejectedValue(new Error("missing"));
    await cacheTile("bad-url");
    expect(fetch).not.toHaveBeenCalled();

    fetch.mockResolvedValue({ ok: false });
    await cacheTile("https://server/tile/3/2/2.jpg");
    expect(filesystem.writeFile).not.toHaveBeenCalled();
  });

  it("preloads native tiles and reports cached, saved and failed entries", async () => {
    filesystem.stat.mockImplementation(({ path }) =>
      path.endsWith("/1.jpg")
        ? Promise.resolve({})
        : Promise.reject(new Error("missing")),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((url) =>
        Promise.resolve({
          ok: !url.endsWith("/3.jpg"),
          blob: () => Promise.resolve(new Blob(["tile"])),
        }),
      ),
    );
    const onProgress = vi.fn();
    const urls = [1, 2, 3].map((x) => `https://server/tile/3/2/${x}.jpg`);

    const stats = await preloadUrls(urls, { concurrency: 2, onProgress });

    expect(stats).toEqual({
      requested: 3,
      alreadyCached: 1,
      saved: 1,
      failed: 1,
    });
    expect(filesystem.mkdir).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("map-tiles-native-count")).toBe("1");
    expect(onProgress).toHaveBeenLastCalledWith(3, 3, stats);
  });

  it("clears files and metadata even when the directory is absent", async () => {
    localStorage.setItem("map-tiles-native-count", "4");
    filesystem.rmdir.mockRejectedValue(new Error("missing"));

    await expect(clearMapCache()).resolves.toBeUndefined();

    expect(filesystem.rmdir).toHaveBeenCalledWith({
      path: "map-tiles",
      directory: "DATA",
      recursive: true,
    });
    expect(localStorage.getItem("map-tiles-native-count")).toBeNull();
  });
  it("clears an over-limit legacy native cache that has no LRU index", async () => {
    localStorage.setItem("map-tiles-native-count", "6000");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["tile"])),
      }),
    );

    await cacheTile("https://server/tile/3/2/4.jpg");

    expect(filesystem.rmdir).toHaveBeenCalledWith({
      path: "map-tiles",
      directory: "DATA",
      recursive: true,
    });
    expect(localStorage.getItem("map-tiles-native-count")).toBeNull();
    expect(localStorage.getItem("map-tiles-metadata-v1")).toBeNull();
  });
  it("evicts least-recently-used indexed native tiles", async () => {
    const metadata = Object.fromEntries(
      Array.from({ length: 6_001 }, (_, index) => [
        `map-tiles/1/1/${index}.jpg`,
        index + 1,
      ]),
    );
    localStorage.setItem("map-tiles-native-count", "6000");
    localStorage.setItem("map-tiles-metadata-v1", JSON.stringify(metadata));
    filesystem.deleteFile.mockImplementation(({ path }) =>
      path.endsWith("/0.jpg")
        ? Promise.reject(new Error("already removed"))
        : Promise.resolve(),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["tile"])),
      }),
    );

    await cacheTile("https://server/tile/3/2/4.jpg");

    expect(filesystem.deleteFile).toHaveBeenCalledTimes(601);
    expect(localStorage.getItem("map-tiles-native-count")).toBe("5401");
    const remaining = JSON.parse(localStorage.getItem("map-tiles-metadata-v1"));
    expect(remaining["map-tiles/1/1/0.jpg"]).toBeDefined();
    expect(remaining["map-tiles/3/2/4.jpg"]).toBeDefined();
  });
});
