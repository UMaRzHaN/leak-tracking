import { act, render, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mapMocks = vi.hoisted(() => ({
  addMarkers: vi.fn(),
  createOfflineMap: vi.fn(),
  destroy: vi.fn(),
  fitBounds: vi.fn(),
  locateMe: vi.fn(),
  mapOff: vi.fn(),
  mapOn: vi.fn(),
  setGpsTracking: vi.fn(),
  setHeatmap: vi.fn(),
  setView: vi.fn(),
}));
const serviceMocks = vi.hoisted(() => ({
  buildTileUrls: vi.fn(() => ["tile:leak"]),
  buildViewportTileUrls: vi.fn(() => ["tile:viewport"]),
  handleExport: vi.fn(async ({ saveFn, onSuccess }) => {
    const result = await saveFn();
    onSuccess(result);
  }),
  preloadUrls: vi.fn(async (urls, { onProgress }) => {
    onProgress(urls.length, urls.length);
    return { saved: urls.length, alreadyCached: 0, failed: 0 };
  }),
  saveLeaksKML: vi.fn(async () => ({ message: "KML ready" })),
}));

// Resolves against the real English locale, so these assertions fail if the
// screen loses a translation rather than quietly falling back to the key.
vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({
    activeProject: {
      id: "project-1",
      type: "upstream",
      folderName: "project-folder",
    },
  }),
}));
vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: (leaks) => ({
    leaks: leaks.map((leak) => ({ ...leak, _location: leak.station ?? "" })),
    locations: Array.from(new Set(leaks.map((leak) => leak.station ?? ""))),
    main: "field",
    mainLabel: "Field",
    secondary: "station",
    label: "Station",
  }),
}));
vi.mock("@/utils/monitoringRound", () => ({
  readMonitoringRound: () => null,
}));
vi.mock("@/pages/MapPage/offlineMap", () => ({
  addMarkers: mapMocks.addMarkers,
  createOfflineMap: mapMocks.createOfflineMap,
}));
vi.mock("@/services/maps/tileCache", () => ({
  buildTileUrls: serviceMocks.buildTileUrls,
  buildViewportTileUrls: serviceMocks.buildViewportTileUrls,
  preloadUrls: serviceMocks.preloadUrls,
}));
vi.mock("@/pages/MapPage/handleExport", () => ({
  handleExport: serviceMocks.handleExport,
}));
vi.mock("@/pages/MapPage/kml", () => ({
  saveLeaksKML: serviceMocks.saveLeaksKML,
}));

import { useMapPage } from "./useMapPage";

const leaks = [
  {
    id: "near-open",
    lat: 41,
    lng: 69,
    status: "open",
    priority: "high",
    field: "North",
    station: "A",
  },
  {
    id: "far-resolved",
    lat: 42,
    lng: 70,
    status: "resolved",
    priority: "low",
    field: "South",
    station: "B",
  },
];

function createMapResult() {
  const map = {
    fitBounds: mapMocks.fitBounds,
    getBounds: () => ({
      getNorth: () => 42,
      getSouth: () => 40,
      getEast: () => 70,
      getWest: () => 68,
    }),
    getCenter: () => ({ lat: 41, lng: 69 }),
    getZoom: () => 13,
    invalidateSize: vi.fn(),
    off: mapMocks.mapOff,
    on: mapMocks.mapOn,
    setView: mapMocks.setView,
  };
  return {
    map,
    markersLayer: { id: "markers" },
    locateMe: mapMocks.locateMe,
    setGpsTracking: mapMocks.setGpsTracking,
    setHeatmap: mapMocks.setHeatmap,
    destroy: mapMocks.destroy,
  };
}

describe("useMapPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mapMocks.createOfflineMap.mockReturnValue(createMapResult());
  });

  it("combines status, priority, location, and nearby filters", () => {
    const { result } = renderHook(() =>
      useMapPage({ leaks, coords: { lat: 41, lng: 69 } }),
    );

    expect(result.current.visibleLeaks.map((leak) => leak.id)).toEqual([
      "near-open",
      "far-resolved",
    ]);

    act(() => result.current.togglePriorityFilter("high"));
    expect(result.current.visibleLeaks.map((leak) => leak.id)).toEqual([
      "near-open",
    ]);

    act(() => result.current.clearPriorityFilters());
    act(() => result.current.toggleStatusFilter("resolved"));
    expect(result.current.visibleLeaks.map((leak) => leak.id)).toEqual([
      "far-resolved",
    ]);

    act(() => result.current.clearStatusFilters());
    act(() => result.current.toggleLocation("B"));
    expect(result.current.visibleLeaks.map((leak) => leak.id)).toEqual([
      "near-open",
    ]);

    act(() => result.current.toggleLocation("B"));
    act(() => result.current.setNearbyRadius(500));
    act(() => result.current.setNearbyOnly(true));
    expect(result.current.visibleLeaks.map((leak) => leak.id)).toEqual([
      "near-open",
    ]);
    expect(result.current.visibleLeaks[0]._distance).toBe(0);
  });

  it("initializes, updates, and destroys the map adapter", async () => {
    let current;
    function Harness({ gpsEnabled }) {
      current = useMapPage({
        leaks,
        coords: { lat: 41, lng: 69 },
        gpsEnabled,
      });
      return <div ref={current.containerRef} />;
    }

    const view = render(<Harness gpsEnabled />);

    await waitFor(() => expect(mapMocks.createOfflineMap).toHaveBeenCalled());
    expect(mapMocks.createOfflineMap.mock.calls[0][1]).toMatchObject({
      center: [41, 69],
      initialUserCoords: { lat: 41, lng: 69 },
      gpsEnabled: true,
    });
    await waitFor(() =>
      expect(mapMocks.addMarkers).toHaveBeenCalledWith(
        { id: "markers" },
        expect.arrayContaining([
          expect.objectContaining({ id: "near-open" }),
          expect.objectContaining({ id: "far-resolved" }),
        ]),
        expect.any(Object),
      ),
    );
    expect(mapMocks.fitBounds).toHaveBeenCalled();

    act(() => current.setHeatmapEnabled(true));
    await waitFor(() =>
      expect(mapMocks.setHeatmap).toHaveBeenLastCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: "near-open" })]),
      ),
    );

    view.rerender(<Harness gpsEnabled={false} />);
    await waitFor(() =>
      expect(mapMocks.setGpsTracking).toHaveBeenLastCalledWith(false, {
        lat: 41,
        lng: 69,
      }),
    );
    act(() => current.locateMe());
    expect(mapMocks.locateMe).not.toHaveBeenCalled();

    view.rerender(<Harness gpsEnabled />);
    await waitFor(() =>
      expect(mapMocks.setGpsTracking).toHaveBeenLastCalledWith(true, {
        lat: 41,
        lng: 69,
      }),
    );

    view.unmount();
    expect(mapMocks.mapOff).toHaveBeenCalledWith("moveend");
    expect(mapMocks.destroy).toHaveBeenCalledOnce();
  });

  it("downloads a deduplicated map area and exports the visible leaks", async () => {
    let current;
    function Harness() {
      current = useMapPage({ leaks, coords: { lat: 41, lng: 69 } });
      return <div ref={current.containerRef} />;
    }

    render(<Harness />);
    await waitFor(() => expect(mapMocks.createOfflineMap).toHaveBeenCalled());

    await act(() => current.handleDownloadArea());
    expect(serviceMocks.preloadUrls).toHaveBeenCalledWith(
      ["tile:viewport"],
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
    expect(current.tileProgress).toMatchObject({
      done: 1,
      total: 1,
      status: "success",
      stats: { saved: 1, failed: 0 },
    });

    await act(() => current.handleExportKML());
    expect(serviceMocks.saveLeaksKML).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "near-open" }),
        expect.objectContaining({ id: "far-resolved" }),
      ]),
      "upstream",
      "project-folder",
      "en",
    );
    expect(current.notification).toEqual({
      type: "success",
      message: "KML ready",
    });

    act(() => current.focusLeak(leaks[0], 17));
    expect(mapMocks.setView).toHaveBeenLastCalledWith([41, 69], 17, {
      animate: true,
    });
    act(() => current.locateMe());
    expect(mapMocks.locateMe).toHaveBeenCalledWith({ lat: 41, lng: 69 });
  });

  it("lets the user cancel an in-progress offline map download", async () => {
    serviceMocks.preloadUrls.mockImplementationOnce(
      (_urls, { signal, onProgress }) =>
        new Promise((resolve, reject) => {
          onProgress(1, 2);
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    let current;
    function Harness() {
      current = useMapPage({ leaks, coords: { lat: 41, lng: 69 } });
      return <div ref={current.containerRef} />;
    }

    render(<Harness />);
    await waitFor(() => expect(mapMocks.createOfflineMap).toHaveBeenCalled());
    let download;
    act(() => {
      download = current.handleDownloadArea();
    });
    await waitFor(() => expect(current.downloading).toBe(true));
    act(() => current.cancelDownload());
    await act(async () => download);

    expect(current.downloading).toBe(false);
    expect(current.tileProgress).toMatchObject({
      done: 1,
      total: 2,
      status: "cancelled",
    });
  });
});
