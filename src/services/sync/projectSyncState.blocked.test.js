import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

/**
 * Соединение с базой синхронизации тоже кэшируется, и без срока ожидания
 * заблокированное открытие останавливало бы чтение состояния навсегда — а его
 * ждёт загрузка проекта.
 */

const { IDB_BLOCKED_TIMEOUT_MS } = await import("@/repositories/idbConnection");

let openRequests;

describe("projectSyncState when another tab blocks the open", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
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
    localStorage.clear();
  });

  it("возвращает то, что известно, вместо бесконечного ожидания", async () => {
    const { readProjectSyncStateAsync } = await import("./projectSyncState");

    const reading = readProjectSyncStateAsync("project-1");
    openRequests[0].onblocked();
    vi.advanceTimersByTime(IDB_BLOCKED_TIMEOUT_MS);

    await expect(reading).resolves.toMatchObject({ deleted: {} });
  });

  it("не запирает базу: следующее чтение открывает её заново", async () => {
    const { readProjectSyncStateAsync } = await import("./projectSyncState");

    const reading = readProjectSyncStateAsync("project-1");
    openRequests[0].onblocked();
    vi.advanceTimersByTime(IDB_BLOCKED_TIMEOUT_MS);
    await reading;

    // Открытие идёт до первого `await`, так что счёт можно снять сразу.
    const retry = readProjectSyncStateAsync("project-1");
    expect(globalThis.indexedDB.open).toHaveBeenCalledTimes(2);

    openRequests[1].error = new Error("closed");
    openRequests[1].onerror();
    await expect(retry).resolves.toMatchObject({ deleted: {} });
  });
});
