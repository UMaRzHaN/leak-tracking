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

  it("returns safe defaults when Cache API calls fail", async () => {
    cachesMock.open.mockRejectedValue(new Error("cache unavailable"));

    await expect(getTileBlobUrl("tile")).resolves.toBeNull();
    await expect(getMapCacheInfo()).resolves.toEqual({
      count: 0,
      sizeMB: 0,
    });
    await expect(cacheTile("tile")).resolves.toBeUndefined();
  });
  it("evicts least-recently-used web tiles when the quota is exceeded", async () => {
    const requests = Array.from({ length: 6_001 }, (_, index) => ({
      url: `https://tiles/${index}`,
    }));
    cache.keys.mockResolvedValue(requests);
    cache.match.mockResolvedValue(undefined);
    cache.delete.mockResolvedValue(true);
    localStorage.setItem(
      "map-tiles-metadata-v1",
      JSON.stringify(
        Object.fromEntries(requests.map(({ url }, index) => [url, index + 1])),
      ),
    );

    await cacheTile("https://tiles/new", { ok: true });

    expect(cache.delete).toHaveBeenCalledTimes(601);
    expect(cache.delete).toHaveBeenCalledWith(requests[0]);
    const metadata = JSON.parse(localStorage.getItem("map-tiles-metadata-v1"));
    expect(metadata[requests[0].url]).toBeUndefined();
    expect(metadata[requests.at(-1).url]).toBeDefined();
  });
});
