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

  it("starts and stops GPS tracking and releases map resources", () => {
    const container = document.createElement("div");
    const adapter = createOfflineMap(container, {
      center: [41, 69],
      zoom: 13,
      initialUserCoords: { lat: 41.1, lng: 69.1 },
      gpsEnabled: true,
    });

    expect(leaflet.map.setView).toHaveBeenCalledWith([41, 69], 13);
    expect(geolocation.watchPosition).toHaveBeenCalledOnce();
    expect(leaflet.markers[0].latlng).toEqual([41.1, 69.1]);

    adapter.locateMe();
    expect(leaflet.map.setView).toHaveBeenLastCalledWith([41.1, 69.1], 17, {
      animate: true,
    });

    adapter.setGpsTracking(false);
    expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(leaflet.map.removeLayer).toHaveBeenCalledWith(leaflet.markers[0]);

    adapter.setGpsTracking(true, { lat: 42, lng: 70 });
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2);
    expect(leaflet.markers.at(-1).latlng).toEqual([42, 70]);

    adapter.destroy();
    expect(leaflet.map.off).toHaveBeenCalled();
    expect(leaflet.map.remove).toHaveBeenCalledOnce();
    expect(geolocation.clearWatch).toHaveBeenCalledTimes(2);
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

  it("uses a one-shot GPS fix and pauses continuous tracking while hidden", () => {
    const adapter = createOfflineMap(document.createElement("div"), {
      center: [41, 69],
      gpsEnabled: false,
    });

    adapter.locateMe();
    expect(geolocation.getCurrentPosition).toHaveBeenCalledOnce();
    const oneShotSuccess = geolocation.getCurrentPosition.mock.calls[0][0];
    oneShotSuccess({
      coords: { latitude: 41.5, longitude: 69.5, heading: 370 },
    });
    expect(leaflet.markers.at(-1).latlng).toEqual([41.5, 69.5]);
    expect(leaflet.map.setView).toHaveBeenLastCalledWith([41.5, 69.5], 17, {
      animate: true,
    });

    adapter.setGpsTracking(true);
    const watchSuccess = geolocation.watchPosition.mock.calls[0][0];
    watchSuccess({
      coords: { latitude: 41.5001, longitude: 69.5001, heading: null },
    });
    expect(leaflet.markers.at(-1).setLatLng).toHaveBeenCalledWith([
      41.5001, 69.5001,
    ]);

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new CustomEvent("visibilitychange"));
    expect(geolocation.clearWatch).toHaveBeenCalledWith(7);

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new CustomEvent("visibilitychange"));
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2);

    adapter.destroy();
  });
});
