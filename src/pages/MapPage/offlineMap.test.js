import { beforeEach, describe, expect, it, vi } from "vitest";

const leaflet = vi.hoisted(() => ({
  cluster: null,
  divIcons: [],
  map: null,
  markers: [],
}));

vi.mock("leaflet", () => {
  class Layer {
    constructor(options = {}) {
      this.options = options;
    }

    addTo(map) {
      this._map = map;
      return this;
    }

    static extend(definition) {
      class ExtendedLayer extends this {}
      Object.assign(ExtendedLayer.prototype, definition);
      return ExtendedLayer;
    }
  }

  class TileLayer extends Layer {
    constructor(url, options = {}) {
      super(options);
      this.url = url;
      this._tiles = {};
    }

    getTileUrl() {
      return this.url;
    }

    _removeTile() {}
  }

  const marker = vi.fn((latlng, options) => {
    const instance = {
      latlng,
      options,
      addTo: vi.fn(() => instance),
      bindPopup: vi.fn(() => instance),
      on: vi.fn((event, handler) => {
        instance.handlers ??= {};
        instance.handlers[event] = handler;
        return instance;
      }),
      setIcon: vi.fn(() => instance),
      setLatLng: vi.fn(() => instance),
    };
    leaflet.markers.push(instance);
    return instance;
  });

  const api = {
    Layer,
    TileLayer,
    DomUtil: {
      create: vi.fn(() => {
        const canvas = document.createElement("canvas");
        canvas.getContext = vi.fn(() => null);
        return canvas;
      }),
      setPosition: vi.fn(),
    },
    divIcon: vi.fn((options) => {
      leaflet.divIcons.push(options);
      return options;
    }),
    map: vi.fn(() => leaflet.map),
    marker,
    markerClusterGroup: vi.fn(() => leaflet.cluster),
    setOptions: vi.fn((target, options) => {
      target.options = { ...(target.options ?? {}), ...options };
    }),
  };

  return { default: api };
});
vi.mock("leaflet.markercluster", () => ({}));
vi.mock("@/i18n", () => ({
  default: {
    language: "en",
    t: (key) => key,
  },
}));
vi.mock("@/services/maps/tileCache", () => ({
  cacheTile: vi.fn(),
  getTileBlobUrl: vi.fn(async () => null),
}));
vi.mock("@/configs/mapTiles", () => ({
  TILE_ATTRIBUTION: "Map provider",
  TILE_URL_TEMPLATE: "https://tiles/{z}/{x}/{y}",
}));

import { addMarkers, createOfflineMap } from "./offlineMap";

function createMapMock() {
  const map = {
    _suppressLeakClickMoveend: false,
    getPanes: () => ({ overlayPane: document.createElement("div") }),
    getSize: () => ({ x: 300, y: 200 }),
    getZoom: vi.fn(() => 14),
    off: vi.fn(),
    on: vi.fn(),
    remove: vi.fn(),
    removeLayer: vi.fn(),
    setView: vi.fn(() => map),
  };
  return map;
}

describe("offline map adapter", () => {
  let geolocation;

  beforeEach(() => {
    vi.clearAllMocks();
    leaflet.divIcons.length = 0;
    leaflet.markers.length = 0;
    leaflet.map = createMapMock();
    leaflet.cluster = {
      addTo: vi.fn(() => leaflet.cluster),
      clearLayers: vi.fn(),
    };
    geolocation = {
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(() => 7),
    };
    vi.stubGlobal("navigator", { geolocation });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
  });

  it("renders shared GPS coordinates without starting a second watcher", () => {
    const container = document.createElement("div");
    const adapter = createOfflineMap(container, {
      center: [41, 69],
      zoom: 13,
      initialUserCoords: { lat: 41.1, lng: 69.1 },
      gpsEnabled: true,
    });

    expect(leaflet.map.setView).toHaveBeenCalledWith([41, 69], 13);
    expect(geolocation.watchPosition).not.toHaveBeenCalled();
    expect(leaflet.markers[0].latlng).toEqual([41.1, 69.1]);

    adapter.locateMe();
    expect(leaflet.map.setView).toHaveBeenLastCalledWith([41.1, 69.1], 17, {
      animate: true,
    });

    adapter.setGpsTracking(false);
    expect(leaflet.map.removeLayer).toHaveBeenCalledWith(leaflet.markers[0]);

    adapter.setGpsTracking(true, { lat: 42, lng: 70 });
    expect(geolocation.watchPosition).not.toHaveBeenCalled();
    expect(leaflet.markers.at(-1).latlng).toEqual([42, 70]);

    adapter.destroy();
    expect(leaflet.map.off).toHaveBeenCalled();
    expect(leaflet.map.remove).toHaveBeenCalledOnce();
    expect(geolocation.clearWatch).not.toHaveBeenCalled();
  });

  it("renders escaped marker labels and safe popup text", () => {
    const leaks = [
      {
        id: "valid",
        lat: 41,
        lng: 69,
        leak_id: '<img src=x onerror="alert(1)">',
        component: "Valve <script>",
        leak_description: "A&B",
        status: "open",
      },
      { id: "invalid", lat: null, lng: 69 },
    ];

    addMarkers(leaflet.cluster, leaks, leaflet.map);

    expect(leaflet.cluster.clearLayers).toHaveBeenCalledOnce();
    expect(leaflet.markers).toHaveLength(1);
    const iconHtml = leaflet.markers[0].options.icon.html;
    expect(iconHtml).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(iconHtml).not.toContain("<img src=x");

    const popupFactory = leaflet.markers[0].bindPopup.mock.calls[0][0];
    const popup = popupFactory();
    expect(popup.querySelector("img")).toBeNull();
    expect(popup.querySelector("script")).toBeNull();
    expect(popup.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(popup.textContent).toContain("Valve <script>");

    leaflet.markers[0].handlers.click();
    expect(leaflet.map._suppressLeakClickMoveend).toBe(true);
    expect(leaflet.map.setView).toHaveBeenCalledWith([41, 69], 18, {
      animate: true,
    });
  });

  it("updates the marker from shared GPS fixes", () => {
    const adapter = createOfflineMap(document.createElement("div"), {
      center: [41, 69],
      gpsEnabled: false,
    });

    adapter.locateMe();
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();

    adapter.setGpsTracking(true, {
      lat: 41.5001,
      lng: 69.5001,
      heading: null,
    });
    expect(leaflet.markers.at(-1).latlng).toEqual([41.5001, 69.5001]);
    adapter.setGpsTracking(true, {
      lat: 41.5002,
      lng: 69.5002,
      heading: null,
    });
    expect(leaflet.markers.at(-1).setLatLng).toHaveBeenCalledWith([
      41.5002, 69.5002,
    ]);
    expect(geolocation.watchPosition).not.toHaveBeenCalled();

    adapter.destroy();
  });
});

describe("heatmap layer", () => {
  // Sibling of the suite above, so its beforeEach does not reach here: without
  // a reset of its own the shared Leaflet mock accumulates calls across tests.
  beforeEach(() => {
    vi.clearAllMocks();
    leaflet.map = createMapMock();
    leaflet.cluster = {
      addTo: vi.fn(() => leaflet.cluster),
      clearLayers: vi.fn(),
    };
    vi.stubGlobal("navigator", {
      geolocation: { watchPosition: vi.fn(() => 7), clearWatch: vi.fn() },
    });
  });

  function makeAdapter() {
    return createOfflineMap(document.createElement("div"), {
      center: [41, 69],
      gpsEnabled: false,
    });
  }

  it("adds no layer when nothing has usable coordinates", () => {
    const adapter = makeAdapter();

    adapter.setHeatmap([
      { lat: null, lng: null },
      { lat: NaN, lng: 2 },
    ]);

    expect(leaflet.map.removeLayer).not.toHaveBeenCalled();
  });

  it("creates the layer once and feeds it every update", () => {
    const adapter = makeAdapter();

    adapter.setHeatmap([{ lat: 41, lng: 69 }]);
    adapter.setHeatmap([
      { lat: 41, lng: 69 },
      { lat: 42, lng: 70 },
    ]);

    // One layer, two data pushes: re-creating it would drop the canvas and
    // flash the map on every filter change.
    expect(leaflet.map.removeLayer).not.toHaveBeenCalled();
  });

  it("removes the layer when the last point goes away", () => {
    const adapter = makeAdapter();
    adapter.setHeatmap([{ lat: 41, lng: 69 }]);

    adapter.setHeatmap([]);

    expect(leaflet.map.removeLayer).toHaveBeenCalledTimes(1);
  });
});

describe("destroy", () => {
  // Sibling of the suite above, so its beforeEach does not reach here: without
  // a reset of its own the shared Leaflet mock accumulates calls across tests.
  beforeEach(() => {
    vi.clearAllMocks();
    leaflet.map = createMapMock();
    leaflet.cluster = {
      addTo: vi.fn(() => leaflet.cluster),
      clearLayers: vi.fn(),
    };
    vi.stubGlobal("navigator", {
      geolocation: { watchPosition: vi.fn(() => 7), clearWatch: vi.fn() },
    });
  });

  function makeAdapter() {
    return createOfflineMap(document.createElement("div"), {
      center: [41, 69],
      gpsEnabled: false,
    });
  }

  it("tears the map down once", () => {
    const adapter = makeAdapter();

    adapter.destroy();
    adapter.destroy();

    expect(leaflet.map.remove).toHaveBeenCalledTimes(1);
    expect(leaflet.map.off).toHaveBeenCalledTimes(1);
  });

  it("drops the heatmap layer along with the map", () => {
    const adapter = makeAdapter();
    adapter.setHeatmap([{ lat: 41, lng: 69 }]);

    adapter.destroy();

    expect(leaflet.map.removeLayer).toHaveBeenCalled();
  });

  it("ignores heatmap updates after teardown", () => {
    const adapter = makeAdapter();
    adapter.destroy();
    leaflet.map.removeLayer.mockClear();

    adapter.setHeatmap([{ lat: 41, lng: 69 }]);

    // A late update from an unmounted screen must not resurrect a layer on a
    // map that is already gone.
    expect(leaflet.map.removeLayer).not.toHaveBeenCalled();
  });

  it("survives a Leaflet failure while removing", () => {
    const adapter = makeAdapter();
    leaflet.map.remove.mockImplementationOnce(() => {
      throw new Error("already detached");
    });

    expect(() => adapter.destroy()).not.toThrow();
  });
});

describe("locating the user", () => {
  // Sibling suite again — see the note above.
  beforeEach(() => {
    vi.clearAllMocks();
    leaflet.map = createMapMock();
    leaflet.markers.length = 0;
    leaflet.cluster = {
      addTo: vi.fn(() => leaflet.cluster),
      clearLayers: vi.fn(),
    };
    vi.stubGlobal("navigator", {
      geolocation: { watchPosition: vi.fn(() => 7), clearWatch: vi.fn() },
    });
  });

  function makeAdapter(options = {}) {
    return createOfflineMap(document.createElement("div"), {
      center: [41, 69],
      gpsEnabled: false,
      ...options,
    });
  }

  it("centres on the supplied fallback when there is no fix yet", () => {
    const adapter = makeAdapter();

    adapter.locateMe({ lat: 41.5, lng: 69.5 });

    expect(leaflet.map.setView).toHaveBeenCalledWith(
      [41.5, 69.5],
      17,
      expect.objectContaining({ animate: true }),
    );
  });

  it("does nothing without a fix or a fallback", () => {
    const adapter = makeAdapter();
    leaflet.map.setView.mockClear();

    adapter.locateMe(null);

    expect(leaflet.map.setView).not.toHaveBeenCalled();
  });

  it("stays put after teardown", () => {
    const adapter = makeAdapter();
    adapter.destroy();
    leaflet.map.setView.mockClear();

    adapter.locateMe({ lat: 41.5, lng: 69.5 });

    expect(leaflet.map.setView).not.toHaveBeenCalled();
  });

  it("removes the user marker when tracking is switched off", () => {
    const adapter = makeAdapter({
      gpsEnabled: true,
      initialUserCoords: { lat: 41.2, lng: 69.2 },
    });
    leaflet.map.removeLayer.mockClear();

    adapter.setGpsTracking(false);

    expect(leaflet.map.removeLayer).toHaveBeenCalled();
  });
});
