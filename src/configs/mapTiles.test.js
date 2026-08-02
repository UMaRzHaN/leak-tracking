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

  it("exposes protected deployment and default-provider state", async () => {
    vi.stubEnv("VITE_REQUIRE_PRIVATE_TILE_PROVIDER", "true");
    vi.stubEnv(
      "VITE_TILE_URL",
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile",
    );
    vi.resetModules();

    const { IS_DEFAULT_TILE_PROVIDER, PRIVATE_TILE_PROVIDER_REQUIRED } =
      await import("./mapTiles");

    expect(PRIVATE_TILE_PROVIDER_REQUIRED).toBe(true);
    expect(IS_DEFAULT_TILE_PROVIDER).toBe(true);
  });

  it("supports a network-disabled offline-only deployment", async () => {
    vi.stubEnv("VITE_TILE_URL", "https://tiles.example/{z}/{x}/{y}.png");
    vi.stubEnv("VITE_OFFLINE_MAP_ONLY", "true");
    vi.resetModules();

    const { OFFLINE_MAP_ONLY, TILE_PROVIDER_ORIGIN } =
      await import("./mapTiles");

    expect(OFFLINE_MAP_ONLY).toBe(true);
    expect(TILE_PROVIDER_ORIGIN).toBe("https://tiles.example");
  });
});
