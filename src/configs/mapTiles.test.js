import { afterEach, describe, expect, it, vi } from "vitest";

describe("map tile configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses a configured tile template and attribution", async () => {
    vi.stubEnv("VITE_TILE_URL", "https://tiles.example/{z}/{x}/{y}.png");
    vi.stubEnv("VITE_TILE_ATTRIBUTION", "Example Maps");
    vi.resetModules();

    const { buildMapTileUrl, TILE_ATTRIBUTION, TILE_URL_TEMPLATE } =
      await import("./mapTiles");

    expect(TILE_URL_TEMPLATE).toBe("https://tiles.example/{z}/{x}/{y}.png");
    expect(buildMapTileUrl(4, 6, 5)).toBe("https://tiles.example/4/5/6.png");
    expect(TILE_ATTRIBUTION).toBe("Example Maps");
  });
});
