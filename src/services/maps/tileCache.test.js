import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: false }));

const { buildTileUrls, buildViewportTileUrls } = await import("./tileCache");

describe("map tile boundaries", () => {
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
});
