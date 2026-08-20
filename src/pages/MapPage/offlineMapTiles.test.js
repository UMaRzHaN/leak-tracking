import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ definitions: [] }));
const config = vi.hoisted(() => ({ offlineOnly: false }));
const services = vi.hoisted(() => ({
  getTileBlobUrl: vi.fn(),
  cacheTile: vi.fn(),
  assignTileSource: vi.fn(),
  releaseTileResources: vi.fn(),
}));

// Слой тайлов объявляется через L.TileLayer.extend при загрузке модуля.
// Перехватываем определение — так его метод можно испытать, не поднимая карту
// целиком со всеми её слоями и кластерами.
vi.mock("leaflet", () => {
  class Layer {
    static extend(definition) {
      captured.definitions.push(definition);
      class Extended extends this {}
      Object.assign(Extended.prototype, definition);
      return Extended;
    }
  }
  class TileLayer extends Layer {
    _removeTile() {}
  }
  TileLayer.prototype._removeTile = vi.fn();
  return {
    default: {
      TileLayer,
      Layer,
      DivIcon: class {},
      map: vi.fn(),
      marker: vi.fn(),
      divIcon: vi.fn(),
      markerClusterGroup: vi.fn(),
      DomUtil: { create: (tag) => document.createElement(tag) },
      point: vi.fn(),
    },
  };
});
vi.mock("leaflet.markercluster", () => ({}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet.markercluster/dist/MarkerCluster.css", () => ({}));
vi.mock("leaflet.markercluster/dist/MarkerCluster.Default.css", () => ({}));
vi.mock("@/i18n", () => ({ default: { language: "en", t: (key) => key } }));
vi.mock("@/services/maps/tileCache", () => ({
  getTileBlobUrl: services.getTileBlobUrl,
  cacheTile: services.cacheTile,
}));
vi.mock("./tileLifecycle", () => ({
  assignTileSource: services.assignTileSource,
  releaseTileResources: services.releaseTileResources,
}));
vi.mock("@/configs/mapTiles", () => ({
  TILE_ATTRIBUTION: "Map provider",
  TILE_URL_TEMPLATE: "https://tiles/{z}/{x}/{y}",
  get OFFLINE_MAP_ONLY() {
    return config.offlineOnly;
  },
}));

await import("./offlineMap");

/** Первое перехваченное определение — слой тайлов. */
const tileLayer = captured.definitions.find((d) => d.createTile);

const TRANSPARENT_GIF =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

function makeTile() {
  const done = vi.fn();
  const layer = { getTileUrl: () => "https://tiles/14/1/2" };
  const tile = tileLayer.createTile.call(layer, { x: 1, y: 2, z: 14 }, done);
  return { tile, done };
}

describe("слой тайлов офлайн-карты", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.offlineOnly = false;
    globalThis.URL.createObjectURL = vi.fn(() => "blob:tile");
    globalThis.fetch = vi.fn();
  });

  it("берёт тайл из кэша и не ходит в сеть", async () => {
    // Ради этого кэш и заведён: в поле сети нет, а карта нужна.
    services.getTileBlobUrl.mockResolvedValue("blob:cached");

    const { tile, done } = makeTile();
    await vi.waitFor(() =>
      expect(services.assignTileSource).toHaveBeenCalled(),
    );

    expect(services.assignTileSource).toHaveBeenCalledWith(
      tile,
      "blob:cached",
      done,
      { blobUrl: true },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("в офлайн-режиме подставляет пустой тайл вместо запроса", async () => {
    // Режим для площадок, где обращение к чужому серверу выдаёт, куда смотрят.
    config.offlineOnly = true;
    services.getTileBlobUrl.mockResolvedValue(null);

    const { tile, done } = makeTile();
    await vi.waitFor(() =>
      expect(services.assignTileSource).toHaveBeenCalled(),
    );

    expect(services.assignTileSource).toHaveBeenCalledWith(
      tile,
      TRANSPARENT_GIF,
      done,
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("скачивает недостающий тайл и кладёт его в кэш", async () => {
    services.getTileBlobUrl.mockResolvedValue(null);
    const response = {
      ok: true,
      clone: vi.fn(() => "clone"),
      blob: vi.fn(async () => new Blob(["tile"])),
    };
    globalThis.fetch.mockResolvedValue(response);

    const { tile, done } = makeTile();
    await vi.waitFor(() =>
      expect(services.assignTileSource).toHaveBeenCalled(),
    );

    expect(services.cacheTile).toHaveBeenCalledWith(
      "https://tiles/14/1/2",
      "clone",
    );
    expect(services.assignTileSource).toHaveBeenCalledWith(
      tile,
      "blob:tile",
      done,
      { blobUrl: true },
    );
  });

  it("при отказе сети показывает тайл прямой ссылкой", async () => {
    // Полупроводная связь лучше пустой карты: пусть браузер попробует сам.
    services.getTileBlobUrl.mockResolvedValue(null);
    globalThis.fetch.mockRejectedValue(new Error("offline"));

    const { tile, done } = makeTile();
    await vi.waitFor(() =>
      expect(services.assignTileSource).toHaveBeenCalled(),
    );

    expect(tile.crossOrigin).toBe("anonymous");
    expect(services.assignTileSource).toHaveBeenCalledWith(
      tile,
      "https://tiles/14/1/2",
      done,
    );
    expect(services.cacheTile).not.toHaveBeenCalled();
  });

  it("не трогает тайл, снятый с карты, пока он грузился", async () => {
    // Карту увели в сторону: работать над снятым узлом незачем.
    let release;
    services.getTileBlobUrl.mockReturnValue(
      new Promise((resolve) => (release = resolve)),
    );

    const { tile } = makeTile();
    tile._removed = true;
    release(null);
    await Promise.resolve();

    expect(services.assignTileSource).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("даёт тайлу отменяемый запрос", async () => {
    services.getTileBlobUrl.mockResolvedValue(null);
    globalThis.fetch.mockResolvedValue({
      ok: true,
      clone: () => "clone",
      blob: async () => new Blob(["tile"]),
    });

    const { tile } = makeTile();
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    expect(tile._abortController).toBeInstanceOf(AbortController);
    expect(globalThis.fetch.mock.calls[0][1].signal).toBe(
      tile._abortController.signal,
    );
  });

  it("освобождает ресурсы снятого тайла", () => {
    // Каждый тайл держит blob; не отпускать их — течь на всю прокрутку карты.
    const el = document.createElement("img");
    const layer = { _tiles: { "1:2:14": { el } } };

    tileLayer._removeTile.call(layer, "1:2:14");

    expect(services.releaseTileResources).toHaveBeenCalledWith(el);
  });
});
