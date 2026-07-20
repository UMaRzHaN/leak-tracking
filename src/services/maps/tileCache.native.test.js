import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: true }));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Filesystem: {
    rmdir: vi.fn().mockResolvedValue(undefined),
  },
}));

const { getMapCacheInfo } = await import("./tileCache");

describe("tileCache native metadata", () => {
  beforeEach(() => localStorage.clear());

  it("recovers from a corrupted or negative cached tile count", async () => {
    localStorage.setItem("map-tiles-native-count", "broken");
    await expect(getMapCacheInfo()).resolves.toEqual({ count: 0, sizeMB: 0 });

    localStorage.setItem("map-tiles-native-count", "-5");
    await expect(getMapCacheInfo()).resolves.toEqual({ count: 0, sizeMB: 0 });
  });
});
