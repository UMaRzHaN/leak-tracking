import { beforeEach, describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("@/utils/logger", () => ({ logger }));

const { createIdbStore } = await import("./idb");

function openWithDb(store, db) {
  const request = {};
  globalThis.indexedDB.open.mockReturnValueOnce(request);
  store.open();
  request.result = db;
  request.onsuccess();
  return request;
}

describe("createIdbStore error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.indexedDB = { open: vi.fn() };
  });

  it("stays unavailable when IndexedDB is missing or open throws", () => {
    const missing = createIdbStore("missing", "items", 1);
    delete globalThis.indexedDB;
    missing.open();
    expect(missing.getState()).toEqual({ db: null, ready: false });

    globalThis.indexedDB = {
      open: vi.fn(() => {
        throw new Error("blocked");
      }),
    };
    const throwing = createIdbStore("throwing", "items", 1);
    throwing.open();
    expect(throwing.getState().ready).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      "[idb] indexedDB.open threw:",
      expect.any(Error),
    );
  });

  it("creates the object store during an upgrade when it is missing", () => {
    const store = createIdbStore("upgrade", "items", 1);
    const request = {};
    const db = {
      objectStoreNames: { contains: vi.fn(() => false) },
      createObjectStore: vi.fn(),
    };
    globalThis.indexedDB.open.mockReturnValueOnce(request);

    store.open();
    request.onupgradeneeded({ target: { result: db } });

    expect(db.createObjectStore).toHaveBeenCalledWith("items", {
      keyPath: "id",
    });
  });

  it("notifies subscribers when opening fails", () => {
    const store = createIdbStore("open-error", "items", 1);
    const request = { error: new Error("denied") };
    const subscriber = vi.fn();
    store.subscribe(subscriber);
    globalThis.indexedDB.open.mockReturnValueOnce(request);

    store.open();
    request.onerror();

    expect(subscriber).toHaveBeenCalledWith(null, false);
    expect(logger.warn).toHaveBeenCalledWith(
      "[idb] Failed to open IndexedDB:",
      request.error,
    );
  });

  it("resets state, notifies, and reopens after the connection closes", () => {
    const store = createIdbStore("reopen", "items", 1);
    const db = {};
    const subscriber = vi.fn();
    store.subscribe(subscriber);
    openWithDb(store, db);
    globalThis.indexedDB.open.mockReturnValueOnce({});

    db.onclose();

    expect(store.getState()).toEqual({ db: null, ready: false });
    expect(subscriber).toHaveBeenLastCalledWith(null, false);
    expect(globalThis.indexedDB.open).toHaveBeenCalledTimes(2);
  });

  it("logs unexpected connection-level errors", () => {
    const store = createIdbStore("db-error", "items", 1);
    const db = {};
    openWithDb(store, db);
    const error = new Error("unexpected");

    db.onerror({ target: { error } });

    expect(logger.error).toHaveBeenCalledWith(
      "[idb] Unexpected IDB error:",
      error,
    );
  });

  it("returns safe defaults when creating a transaction throws", async () => {
    const store = createIdbStore("tx-error", "items", 1);
    const db = {
      transaction: vi.fn(() => {
        throw new Error("transaction failed");
      }),
    };
    openWithDb(store, db);

    await expect(store.save("a", "value")).resolves.toBe(false);
    await expect(store.get("a")).resolves.toBeNull();
    await expect(store.remove("a")).resolves.toBe(false);
    await expect(store.clear()).resolves.toBe(false);
    await expect(store.listKeys()).resolves.toEqual([]);
    await expect(store.getStrict("a")).rejects.toThrow("transaction failed");
    await expect(store.listKeysStrict()).rejects.toThrow("transaction failed");
    expect(logger.error).toHaveBeenCalledTimes(5);
  });

  it("offers strict reads that distinguish storage failure from missing data", async () => {
    const store = createIdbStore("strict-errors", "items", 1);
    await expect(store.getStrict("a")).rejects.toMatchObject({
      code: "IDB_NOT_READY",
    });
    await expect(store.listKeysStrict()).rejects.toMatchObject({
      code: "IDB_NOT_READY",
    });
  });

  it.each([
    ["save", ["a", "value"], false, "put"],
    ["get", ["a"], null, "get"],
    ["remove", ["a"], false, "delete"],
    ["clear", [], false, "clear"],
    ["listKeys", [], [], "getAllKeys"],
  ])("handles %s request errors", async (method, args, fallback, operation) => {
    const store = createIdbStore(`request-${method}`, "items", 1);
    const request = { error: new Error(`${method} failed`) };
    const objectStore = { [operation]: vi.fn(() => request) };
    const db = {
      transaction: vi.fn(() => ({ objectStore: () => objectStore })),
    };
    openWithDb(store, db);

    const pending = store[method](...args);
    request.onerror();

    await expect(pending).resolves.toEqual(fallback);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(`${method} error`),
      request.error,
    );
  });

  it("does not report a write as successful when its transaction aborts", async () => {
    const store = createIdbStore("aborted-write", "items", 1);
    const request = {};
    const transaction = {
      error: new Error("quota exceeded"),
      objectStore: () => ({ put: vi.fn(() => request) }),
    };
    const db = { transaction: vi.fn(() => transaction) };
    openWithDb(store, db);

    const pending = store.save("a", "value");
    transaction.onabort();

    await expect(pending).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      "[idb] save transaction aborted:",
      transaction.error,
    );
  });
});
