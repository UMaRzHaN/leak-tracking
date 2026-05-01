import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createIdbStore } from "./idb";

/* ── Setup — fresh IndexedDB for every test ──────────────────────────────── */

beforeEach(() => {
  global.indexedDB = new IDBFactory();
});

/* ── Helper ───────────────────────────────────────────────────────────────── */

/** Opens the store and waits until it is ready. */
async function openAndWait(store) {
  store.open();
  await new Promise((resolve) => {
    if (store.getState().ready) return resolve();
    const unsub = store.subscribe(() => {
      if (store.getState().ready) {
        unsub();
        resolve();
      }
    });
  });
}

/* ── Tests ────────────────────────────────────────────────────────────────── */

describe("createIdbStore — shape", () => {
  it("returns an object with the expected public methods", () => {
    const store = createIdbStore("test-db", "items", 1);
    expect(typeof store.open).toBe("function");
    expect(typeof store.get).toBe("function");
    expect(typeof store.save).toBe("function");
    expect(typeof store.remove).toBe("function");
    expect(typeof store.clear).toBe("function");
    expect(typeof store.listKeys).toBe("function");
    expect(typeof store.subscribe).toBe("function");
    expect(typeof store.getState).toBe("function");
  });

  it("starts with ready = false before open() is called", () => {
    const store = createIdbStore("test-db-2", "items", 1);
    expect(store.getState().ready).toBe(false);
    expect(store.getState().db).toBeNull();
  });
});

describe("createIdbStore — open", () => {
  it("becomes ready after open()", async () => {
    const store = createIdbStore("open-test", "items", 1);
    await openAndWait(store);
    expect(store.getState().ready).toBe(true);
    expect(store.getState().db).not.toBeNull();
  });

  it("calling open() twice does not open a second connection", async () => {
    const store = createIdbStore("open-twice", "items", 1);
    await openAndWait(store);
    const db1 = store.getState().db;

    store.open(); // second call — should be a no-op (_db already set)
    await new Promise((r) => setTimeout(r, 20));

    expect(store.getState().db).toBe(db1); // same reference
  });
});

describe("createIdbStore — save / get", () => {
  it("save() followed by get() returns the saved data", async () => {
    const store = createIdbStore("save-get", "items", 1);
    await openAndWait(store);

    // fake-indexeddb structured-clones the value, so we use a plain object
    // (Blob is not cloneable in the jsdom environment used by vitest).
    const payload = { mime: "image/jpeg", data: "base64encodedstring" };
    await store.save("key-1", payload);

    const result = await store.get("key-1");
    expect(result).toEqual(payload);
  });

  it("get() returns null for a key that does not exist", async () => {
    const store = createIdbStore("get-missing", "items", 1);
    await openAndWait(store);

    const result = await store.get("no-such-key");
    expect(result).toBeNull();
  });

  it("save() overwrites an existing key", async () => {
    const store = createIdbStore("overwrite", "items", 1);
    await openAndWait(store);

    await store.save("k", "first");
    await store.save("k", "second");

    expect(await store.get("k")).toBe("second");
  });
});

describe("createIdbStore — remove", () => {
  it("remove() followed by get() returns null", async () => {
    const store = createIdbStore("remove-test", "items", 1);
    await openAndWait(store);

    await store.save("del-key", "value");
    await store.remove("del-key");

    expect(await store.get("del-key")).toBeNull();
  });

  it("remove() is a no-op when the key does not exist", async () => {
    const store = createIdbStore("remove-missing", "items", 1);
    await openAndWait(store);

    await expect(store.remove("ghost")).resolves.not.toThrow();
  });
});

describe("createIdbStore — listKeys / clear", () => {
  it("listKeys() includes saved keys", async () => {
    const store = createIdbStore("list-keys", "items", 1);
    await openAndWait(store);

    await store.save("a", "1");
    await store.save("b", "2");

    const keys = await store.listKeys();
    expect(keys).toContain("a");
    expect(keys).toContain("b");
  });

  it("listKeys() does not include a removed key", async () => {
    const store = createIdbStore("list-after-remove", "items", 1);
    await openAndWait(store);

    await store.save("x", "data");
    await store.remove("x");

    const keys = await store.listKeys();
    expect(keys).not.toContain("x");
  });

  it("clear() empties the store", async () => {
    const store = createIdbStore("clear-test", "items", 1);
    await openAndWait(store);

    await store.save("one", "1");
    await store.save("two", "2");
    await store.clear();

    const keys = await store.listKeys();
    expect(keys).toHaveLength(0);
  });
});

describe("createIdbStore — store isolation", () => {
  it("two stores with different dbNames are independent", async () => {
    const storeA = createIdbStore("db-alpha", "items", 1);
    const storeB = createIdbStore("db-beta", "items", 1);
    await openAndWait(storeA);
    await openAndWait(storeB);

    await storeA.save("shared-key", "from-A");

    // storeB knows nothing about storeA's data
    const fromB = await storeB.get("shared-key");
    expect(fromB).toBeNull();
  });

  it("a store that was never opened returns null / empty for all reads", async () => {
    const unopened = createIdbStore("unopened-db", "items", 1);
    // No open() call — _ready stays false, all reads return safe defaults
    expect(await unopened.get("any")).toBeNull();
    expect(await unopened.listKeys()).toEqual([]);
    expect(await unopened.save("k", "v")).toBe(false);
  });
});
