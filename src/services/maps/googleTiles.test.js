import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ enabled: true }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock("@/configs/mapTiles", () => ({
  get GOOGLE_TILES_ENABLED() {
    return config.enabled;
  },
  GOOGLE_TILES_KEY: "test-key",
  GOOGLE_TILES_ORIGIN: "https://tile.googleapis.com",
}));
vi.mock("@/utils/logger", () => ({ logger: log }));

const SESSION_KEY = "leak-tracking:google-tiles-session";
const inTwoWeeks = () => String(Math.floor(Date.now() / 1000) + 14 * 86400);

function json(body, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function tile(status = 200) {
  return {
    ok: status < 400,
    status,
    blob: async () => new Blob(["jpeg"]),
  };
}

// Модуль держит сессию и признак отключения в своём состоянии: каждому
// испытанию — свежий экземпляр.
async function load() {
  vi.resetModules();
  return import("./googleTiles");
}

describe("Google Map Tiles", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    config.enabled = true;
    globalThis.fetch = vi.fn(async (url) =>
      String(url).includes("createSession")
        ? json({ session: "s1", expiry: inTwoWeeks() })
        : tile(),
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it("заводит одну сессию на все тайлы экрана", async () => {
    const { fetchGoogleTile } = await load();

    await Promise.all([
      fetchGoogleTile({ x: 1, y: 2, z: 18 }),
      fetchGoogleTile({ x: 2, y: 2, z: 18 }),
      fetchGoogleTile({ x: 3, y: 2, z: 18 }),
    ]);

    const sessions = fetch.mock.calls.filter(([url]) =>
      String(url).includes("createSession"),
    );
    expect(sessions).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://tile.googleapis.com/v1/2dtiles/18/1/2?session=s1&key=test-key",
      expect.objectContaining({ mode: "cors" }),
    );
  });

  it("берёт сохранённую сессию после перезапуска", async () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ session: "saved", expiresAt: Date.now() + 86400000 }),
    );
    const { fetchGoogleTile } = await load();

    await fetchGoogleTile({ x: 1, y: 2, z: 18 });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain("session=saved");
  });

  it("на месте без снимка отвечает null", async () => {
    fetch.mockImplementation(async (url) =>
      String(url).includes("createSession")
        ? json({ session: "s1", expiry: inTwoWeeks() })
        : tile(404),
    );
    const { fetchGoogleTile, isGoogleTilesEnabled } = await load();

    await expect(fetchGoogleTile({ x: 1, y: 2, z: 18 })).resolves.toBeNull();
    expect(isGoogleTilesEnabled()).toBe(true);
  });

  it("с негодным ключом замолкает до перезапуска", async () => {
    // Иначе каждый тайл на пустом месте — ещё один отказ в журнале и в сети.
    fetch.mockResolvedValue(json({ error: {} }, 400));
    const { fetchGoogleTile, isGoogleTilesEnabled } = await load();

    await expect(fetchGoogleTile({ x: 1, y: 2, z: 18 })).resolves.toBeNull();
    await fetchGoogleTile({ x: 2, y: 2, z: 18 });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(isGoogleTilesEnabled()).toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it("при отказе в доступе к тайлам тоже замолкает", async () => {
    fetch.mockImplementation(async (url) =>
      String(url).includes("createSession")
        ? json({ session: "s1", expiry: inTwoWeeks() })
        : tile(403),
    );
    const { fetchGoogleTile, isGoogleTilesEnabled } = await load();

    await fetchGoogleTile({ x: 1, y: 2, z: 18 });

    expect(isGoogleTilesEnabled()).toBe(false);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("отозванную сессию забывает и заводит новую", async () => {
    let round = 0;
    fetch.mockImplementation(async (url) => {
      if (String(url).includes("createSession")) {
        round += 1;
        return json({ session: `s${round}`, expiry: inTwoWeeks() });
      }
      return tile(round === 1 ? 400 : 200);
    });
    const { fetchGoogleTile } = await load();

    await expect(fetchGoogleTile({ x: 1, y: 2, z: 18 })).resolves.toBeNull();
    await expect(
      fetchGoogleTile({ x: 1, y: 2, z: 18 }),
    ).resolves.toBeInstanceOf(Blob);
    expect(fetch.mock.calls.at(-1)[0]).toContain("session=s2");
  });

  it("выключен без ключа и не ходит в сеть", async () => {
    config.enabled = false;
    const { fetchGoogleTile, fetchGoogleCopyright } = await load();

    await expect(fetchGoogleTile({ x: 1, y: 2, z: 18 })).resolves.toBeNull();
    await expect(
      fetchGoogleCopyright({ north: 1, south: 0, east: 1, west: 0 }, 18),
    ).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("отдаёт строку правообладателей видимой области", async () => {
    fetch.mockImplementation(async (url) =>
      String(url).includes("createSession")
        ? json({ session: "s1", expiry: inTwoWeeks() })
        : json({ copyright: "Imagery ©2026 Airbus", maxZoom: 20 }),
    );
    const { fetchGoogleCopyright } = await load();

    await expect(
      fetchGoogleCopyright({ north: 44, south: 43, east: 58, west: 57 }, 18),
    ).resolves.toBe("Imagery ©2026 Airbus");
    const url = new URL(fetch.mock.calls.at(-1)[0]);
    expect(url.pathname).toBe("/tile/v1/viewport");
    expect(url.searchParams.get("zoom")).toBe("18");
    expect(url.searchParams.get("north")).toBe("44");
  });

  it("сбой сети не роняет карту", async () => {
    fetch.mockRejectedValue(new Error("offline"));
    const { fetchGoogleTile, fetchGoogleCopyright } = await load();

    await expect(fetchGoogleTile({ x: 1, y: 2, z: 18 })).resolves.toBeNull();
    await expect(
      fetchGoogleCopyright({ north: 1, south: 0, east: 1, west: 0 }, 18),
    ).resolves.toBeNull();
  });
});
