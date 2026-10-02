import { beforeEach, describe, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({
  getTileBlobUrl: vi.fn(),
  cacheTile: vi.fn(),
}));
const placeholder = vi.hoisted(() => ({ isPlaceholderTile: vi.fn() }));

vi.mock("@/services/maps/tileCache", () => services);
vi.mock("@/services/maps/tilePlaceholder", () => placeholder);
vi.mock("@/configs/mapTiles", () => ({
  buildMapTileUrl: (z, y, x) => `https://tiles/${z}/${y}/${x}`,
}));

const { overzoomTileUrl, parentTile } = await import("./tileFallback");

const drawImage = vi.fn();

describe("подстановка уровня крупнее", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    services.getTileBlobUrl.mockResolvedValue(null);
    // По умолчанию сервер на любой запрос отвечает заглушкой «снимка нет».
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => "clone",
      blob: async () => new Blob(["stub"]),
    });
    placeholder.isPlaceholderTile.mockResolvedValue(true);
    globalThis.URL.createObjectURL = vi.fn(() => "blob:cropped");
    globalThis.URL.revokeObjectURL = vi.fn();
    // В jsdom нет ни декодера картинок, ни canvas — подменяем оба.
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 256;
        set src(_value) {
          Promise.resolve().then(() => this.onload?.());
        }
      },
    );
    vi.spyOn(window.HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      /** @type {any} */ ({ drawImage }),
    );
    vi.spyOn(window.HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["jpeg"])),
    );
  });

  it("находит родителя на нужное число уровней выше", () => {
    expect(parentTile({ x: 13, y: 6, z: 19 }, 2)).toEqual({
      x: 3,
      y: 1,
      z: 17,
    });
  });

  it("вырезает из родителя ровно свою долю", async () => {
    services.getTileBlobUrl.mockImplementation(async (url) =>
      url === "https://tiles/17/1/3" ? "blob:parent" : null,
    );

    const url = await overzoomTileUrl({ x: 13, y: 6, z: 19 });

    expect(url).toBe("blob:cropped");
    // x=13 — вторая четверть по горизонтали (13 % 4 = 1), y=6 — третья (6 % 4 = 2).
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      64,
      128,
      64,
      64,
      0,
      0,
      256,
      256,
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:parent");
  });

  it("скачанного родителя кладёт в кэш на случай офлайна", async () => {
    const response = {
      ok: true,
      status: 200,
      clone: () => "clone",
      blob: async () => new Blob(["tile"]),
    };
    globalThis.fetch.mockResolvedValue(response);
    placeholder.isPlaceholderTile.mockResolvedValue(false);

    await overzoomTileUrl({ x: 4, y: 4, z: 10 });

    expect(globalThis.fetch.mock.calls[0][0]).toBe("https://tiles/9/2/2");
    expect(services.cacheTile).toHaveBeenCalledWith(
      "https://tiles/9/2/2",
      "clone",
    );
  });

  it("без сети обходится кэшем и не ходит наружу", async () => {
    const url = await overzoomTileUrl(
      { x: 8, y: 8, z: 12 },
      { network: false },
    );

    expect(url).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("не переспрашивает родителя, которого уже не нашли", async () => {
    // Соседние тайлы делят родителей: на пустом месте это десятки лишних запросов.
    await overzoomTileUrl({ x: 100, y: 100, z: 15 });
    const firstRound = globalThis.fetch.mock.calls.length;
    await overzoomTileUrl({ x: 101, y: 100, z: 15 });

    expect(firstRound).toBeGreaterThan(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(firstRound);
  });
});
