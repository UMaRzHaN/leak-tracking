import { beforeEach, describe, expect, it, vi } from "vitest";

const cache = {
  match: vi.fn(),
  put: vi.fn(),
  keys: vi.fn(),
  delete: vi.fn(),
};
const cachesMock = {
  open: vi.fn().mockResolvedValue(cache),
  delete: vi.fn(),
};
vi.stubGlobal("caches", cachesMock);
vi.mock("@/utils/platform", () => ({ isNative: false }));

const {
  buildTileUrls,
  buildViewportTileUrls,
  cacheTile,
  clearMapCache,
  getMapCacheInfo,
  getTileBlobUrl,
  preloadUrls,
} = await import("./tileCache");

describe("map tile boundaries", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    cachesMock.open.mockResolvedValue(cache);
    cache.match.mockResolvedValue(undefined);
    cache.put.mockResolvedValue(undefined);
    cache.keys.mockResolvedValue([]);
  });

  it("clamps polar coordinates to valid Web Mercator tile rows", () => {
    const urls = buildTileUrls(90, 180, 3, 3);

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      const [, z, y, x] = url.match(/tile\/(\d+)\/(\d+)\/(\d+)$/);
      const count = 2 ** Number(z);
      expect(Number(y)).toBeGreaterThanOrEqual(0);
      expect(Number(y)).toBeLessThan(count);
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      expect(Number(x)).toBeLessThan(count);
    }
  });

  it("covers both sides of a viewport crossing the antimeridian", () => {
    const urls = buildViewportTileUrls(
      { north: 10, south: -10, west: 170, east: -170 },
      2,
      2,
    );
    const xValues = new Set(
      urls.map((url) => Number(url.match(/tile\/\d+\/\d+\/(\d+)$/)[1])),
    );

    expect(urls.length).toBeGreaterThan(0);
    expect(xValues.has(0)).toBe(true);
    expect(xValues.has(3)).toBe(true);
  });

  it("returns no tiles for non-numeric coordinates", () => {
    expect(buildTileUrls("bad", 0, 1, 2)).toEqual([]);
    expect(
      buildViewportTileUrls(
        { north: 10, south: -10, west: 0, east: Number.NaN },
        1,
        2,
      ),
    ).toEqual([]);
  });

  it("reads, writes and clears the web cache", async () => {
    const response = { ok: true, blob: vi.fn().mockResolvedValue(new Blob()) };
    cache.match
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:tile");

    await expect(getTileBlobUrl("https://tiles/1/2/3")).resolves.toBe(
      "blob:tile",
    );
    await cacheTile("https://tiles/1/2/3", response);
    cache.keys.mockResolvedValue([{ url: "one" }, { url: "two" }]);
    await expect(getMapCacheInfo()).resolves.toEqual({
      count: 2,
      sizeMB: 0.1,
    });
    await clearMapCache();

    expect(cache.put).toHaveBeenCalledWith("https://tiles/1/2/3", response);
    expect(cachesMock.delete).toHaveBeenCalledWith("map-tiles-v2");
  });

  it("does not overwrite an existing tile or cache a failed response", async () => {
    cache.match.mockResolvedValueOnce({ ok: true });
    await cacheTile("cached");
    expect(cache.put).not.toHaveBeenCalled();

    cache.match.mockResolvedValueOnce(undefined);
    await cacheTile("failed", { ok: false });
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("preloads uncached tiles concurrently and reports progress", async () => {
    cache.match.mockImplementation((url) =>
      Promise.resolve(url === "cached" ? { ok: true } : undefined),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((url) =>
        Promise.resolve({
          ok: url !== "failed",
          blob: vi.fn(),
        }),
      ),
    );
    const onProgress = vi.fn();

    const stats = await preloadUrls(["cached", "saved", "failed"], {
      concurrency: 2,
      onProgress,
    });

    expect(stats).toEqual({
      requested: 3,
      alreadyCached: 1,
      saved: 1,
      failed: 1,
    });
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith(3, 3, stats);
  });

  it("does not start another download batch after abort", async () => {
    const controller = new AbortController();
    cache.match.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        controller.abort();
        return { ok: true };
      }),
    );

    await expect(
      preloadUrls(["one", "two"], {
        concurrency: 1,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("returns safe defaults when Cache API calls fail", async () => {
    cachesMock.open.mockRejectedValue(new Error("cache unavailable"));

    await expect(getTileBlobUrl("tile")).resolves.toBeNull();
    await expect(getMapCacheInfo()).resolves.toEqual({
      count: 0,
      sizeMB: 0,
    });
    await expect(cacheTile("tile")).resolves.toBeUndefined();
  });

  it("reports a preload as failed when Cache Storage cannot be opened", async () => {
    // Without a cache there is nowhere to store a tile, and silently counting
    // those tiles as neither saved nor failed would show the user a finished
    // preload that cached nothing.
    cachesMock.open.mockRejectedValue(new Error("cache unavailable"));

    const stats = await preloadUrls(["one", "two"], { concurrency: 1 });

    expect(stats).toMatchObject({ saved: 0, alreadyCached: 0, failed: 2 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("evicts by real cache size even when metadata undercounts", async () => {
    const requests = Array.from({ length: 6_001 }, (_, index) => ({
      url: `https://tiles/${index}`,
    }));
    cache.keys.mockResolvedValue(requests);
    cache.match.mockResolvedValue(undefined);
    cache.delete.mockResolvedValue(true);
    localStorage.setItem(
      "map-tiles-metadata-v1",
      JSON.stringify(
        Object.fromEntries(
          requests.slice(0, 10).map(({ url }, index) => [url, index + 1]),
        ),
      ),
    );

    await cacheTile("https://tiles/new", { ok: true });

    expect(cache.delete).toHaveBeenCalledTimes(601);
    expect(cache.delete).toHaveBeenCalledWith(requests[10]);
    const metadata = JSON.parse(localStorage.getItem("map-tiles-metadata-v1"));
    expect(metadata[requests[0].url]).toBeDefined();
    expect(metadata[requests[10].url]).toBeUndefined();
    expect(metadata[requests.at(-1).url]).toBeDefined();
  });
  it("reconciles stale metadata before calculating web eviction", async () => {
    const requests = Array.from({ length: 5_000 }, (_, index) => ({
      url: "https://tiles/" + index,
    }));
    const staleMetadata = Object.fromEntries(
      Array.from({ length: 6_001 }, (_, index) => [
        "https://tiles/" + index,
        index + 1,
      ]),
    );
    cache.keys.mockResolvedValue(requests);
    cache.match.mockResolvedValue(undefined);
    localStorage.setItem(
      "map-tiles-metadata-v1",
      JSON.stringify(staleMetadata),
    );

    await cacheTile("https://tiles/new", { ok: true });

    expect(cache.delete).not.toHaveBeenCalled();
    const metadata = JSON.parse(localStorage.getItem("map-tiles-metadata-v1"));
    expect(Object.keys(metadata)).toHaveLength(5_000);
    expect(metadata["https://tiles/6000"]).toBeUndefined();
  });
});
