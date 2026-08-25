import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

/**
 * Соединение с базой утечек кэшируется, поэтому зависшее открытие зависает не
 * один раз: тот же промис выдаётся каждому следующему чтению, и экран загрузки
 * остаётся навсегда — без ошибки, которую можно показать. Здесь проверяется,
 * что открытие всегда чем-то кончается и что неудача не запирает стор.
 */

const { IDB_BLOCKED_TIMEOUT_MS } = await import("./idbConnection");

let openRequests;

/** Пустая база: каждый запрос возвращается без результата. */
const objectStore = {
  get: () => ({}),
  index: () => ({ getAll: () => ({}) }),
};

async function loadStore() {
  vi.resetModules();
  return import("./webProjectEnvelopeStore");
}

describe("webProjectEnvelopeStore when another tab blocks the open", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    openRequests = [];
    globalThis.indexedDB = {
      open: vi.fn(() => {
        const request = { result: null, error: null };
        openRequests.push(request);
        return request;
      }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.indexedDB;
  });

  it("отказывает чтению вместо того, чтобы висеть", async () => {
    const { readWebData } = await loadStore();

    const reading = readWebData("proj-1");
    openRequests[0].onblocked();
    vi.advanceTimersByTime(IDB_BLOCKED_TIMEOUT_MS);

    await expect(reading).rejects.toMatchObject({ code: "IDB_BLOCKED" });
  });

  it("не запирает стор: следующее чтение открывает базу заново", async () => {
    const { readWebData } = await loadStore();

    const reading = readWebData("proj-1");
    openRequests[0].onblocked();
    vi.advanceTimersByTime(IDB_BLOCKED_TIMEOUT_MS);
    await expect(reading).rejects.toMatchObject({ code: "IDB_BLOCKED" });

    // Соседняя вкладка закрылась — повтор должен дойти до базы, а не получить
    // тот же отказ из кэша.
    const retry = readWebData("proj-1");
    expect(globalThis.indexedDB.open).toHaveBeenCalledTimes(2);

    const db = {
      close: vi.fn(),
      transaction: vi.fn(() => {
        const tx = { objectStore: () => objectStore };
        Promise.resolve().then(() => tx.oncomplete?.());
        return tx;
      }),
    };
    openRequests[1].result = db;
    openRequests[1].onsuccess();

    await expect(retry).resolves.toBeNull();
  });

  it("роняет кэш соединения, когда схему обновляет соседняя вкладка", async () => {
    const { readWebDataRevision } = await loadStore();

    const db = {
      close: vi.fn(),
      transaction: vi.fn(() => {
        const tx = { objectStore: () => objectStore };
        Promise.resolve().then(() => tx.oncomplete?.());
        return tx;
      }),
    };
    const reading = readWebDataRevision("proj-1");
    openRequests[0].result = db;
    openRequests[0].onsuccess();
    await reading;

    db.onversionchange();
    expect(db.close).toHaveBeenCalled();

    readWebDataRevision("proj-1");
    expect(globalThis.indexedDB.open).toHaveBeenCalledTimes(2);
  });
});

describe("ключи наборов данных проекта", () => {
  it("оставляет утечки под голым идентификатором, а остальным даёт префикс", async () => {
    const { COMPONENT_DATASET, LEAK_DATASET, datasetRecordKey } =
      await loadStore();

    // Ключ утечек не меняется: миграция, которой нет, — это миграция, которая
    // не потеряет данные.
    expect(datasetRecordKey(LEAK_DATASET, "p1")).toBe("p1");
    expect(datasetRecordKey(COMPONENT_DATASET, "p1")).toBe("components:p1");
  });

  it("не трогает базы, когда стирать нечего", async () => {
    const { purgeWebProject } = await loadStore();

    // Без проекта стирать нечего, и до баз дело не доходит.
    await expect(purgeWebProject("")).resolves.toBe(false);
  });
});
