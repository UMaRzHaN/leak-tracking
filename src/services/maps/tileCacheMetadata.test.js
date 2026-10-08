import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: false }));

const {
  flushMetadata,
  oldestKeys,
  readMetadata,
  removeMetadata,
  resetMetadataMemory,
  touchMetadata,
} = await import("./tileCacheMetadata");

const KEY = "map-tiles-metadata-v1";

describe("отметки использования тайлов", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetMetadataMemory();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("не пишет всю таблицу в хранилище на каждый тайл", () => {
    // Раньше каждый показанный тайл — полный JSON.parse/stringify таблицы до
    // шести тысяч записей и синхронный setItem на главном потоке.
    localStorage.setItem(
      KEY,
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: 6000 }, (_, i) => [`t${i}`, i]),
        ),
      ),
    );
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const parse = vi.spyOn(JSON, "parse");

    for (let i = 0; i < 100; i += 1) touchMetadata(`new${i}`);

    expect(parse).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(setItem).toHaveBeenCalledOnce();
    const stored = JSON.parse(localStorage.getItem(KEY));
    expect(Object.keys(stored)).toHaveLength(6100);
  });

  it("сбрасывает отметки при уходе со страницы, не дожидаясь таймера", () => {
    touchMetadata("tile-a");
    expect(localStorage.getItem(KEY)).toBeNull();

    window.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(localStorage.getItem(KEY))).toHaveProperty("tile-a");
  });

  it("сбрасывает отметки, когда приложение уходит в фон", () => {
    touchMetadata("tile-b");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(JSON.parse(localStorage.getItem(KEY))).toHaveProperty("tile-b");
  });

  it("сохраняет порядок LRU и удаление записей", () => {
    vi.setSystemTime(1000);
    touchMetadata("old");
    vi.setSystemTime(2000);
    touchMetadata("mid");
    vi.setSystemTime(3000);
    touchMetadata("new");
    vi.setSystemTime(4000);
    touchMetadata("old");

    expect(oldestKeys(["old", "mid", "new"], readMetadata(), 2)).toEqual([
      "mid",
      "new",
    ]);

    removeMetadata(["mid"]);
    flushMetadata();
    expect(Object.keys(JSON.parse(localStorage.getItem(KEY))).sort()).toEqual([
      "new",
      "old",
    ]);
  });
});
