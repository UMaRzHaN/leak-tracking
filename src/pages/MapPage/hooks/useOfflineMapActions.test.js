import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tileCache = vi.hoisted(() => ({
  preloadUrls: vi.fn(),
  buildViewportTileUrls: vi.fn(() => ["tile-a", "tile-b"]),
}));
vi.mock("@/services/maps/tileCache", () => tileCache);

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const { useOfflineMapActions } = await import("./useOfflineMapActions");

const bounds = {
  getNorth: () => 55.1,
  getSouth: () => 55.0,
  getEast: () => 73.1,
  getWest: () => 73.0,
};

function setup() {
  const notify = vi.fn();
  const mapRef = {
    current: { map: { getBounds: () => bounds, getZoom: () => 14 } },
  };
  const hook = renderHook(() => useOfflineMapActions({ mapRef, notify }));
  return { ...hook, notify };
}

describe("useOfflineMapActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    tileCache.buildViewportTileUrls.mockReturnValue(["tile-a", "tile-b"]);
  });
  afterEach(() => vi.useRealTimers());

  it("reports progress and clears the bar a while after a finished download", async () => {
    tileCache.preloadUrls.mockImplementation(async (urls, { onProgress }) => {
      onProgress(1, urls.length);
      return { saved: 2, alreadyCached: 0 };
    });

    const { result } = setup();
    await act(async () => {
      await result.current.handleDownloadArea();
    });

    expect(result.current.tileProgress).toMatchObject({ status: "success" });
    expect(result.current.downloading).toBe(false);

    // The bar stays up long enough to be read, then goes on its own.
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    await waitFor(() => expect(result.current.tileProgress).toBeNull());
  });

  it("marks a cancelled download and then clears it too", async () => {
    let release;
    tileCache.preloadUrls.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );

    const { result } = setup();
    let pending;
    await act(async () => {
      pending = result.current.handleDownloadArea();
    });

    act(() => result.current.cancelDownload());
    expect(result.current.tileProgress).toMatchObject({ status: "cancelled" });
    expect(result.current.downloading).toBe(false);

    await act(async () => {
      release({ saved: 0, alreadyCached: 0 });
      await pending;
      vi.advanceTimersByTime(2500);
    });
    await waitFor(() => expect(result.current.tileProgress).toBeNull());
  });

  it("says so when the viewport yields no tiles", async () => {
    tileCache.buildViewportTileUrls.mockReturnValue([]);

    const { result, notify } = setup();
    await act(async () => {
      await result.current.handleDownloadArea();
    });

    expect(notify).toHaveBeenCalledWith("error", expect.any(String));
    expect(tileCache.preloadUrls).not.toHaveBeenCalled();
  });
});
