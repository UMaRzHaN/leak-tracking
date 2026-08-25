import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIdbStore } from "@/repositories/idb";

/**
 * Сквозная проверка того, ради чего всё затевалось: отказ по месту обязан
 * доехать до вызывающего с кодом, а любой другой — остаться прежним `false`.
 *
 * Раньше `save` возвращал `false` на всё подряд, и отличить «закончилось
 * место» от «хранилище сломано» было нечем — а действие пользователя в этих
 * случаях разное.
 */
function stubIndexedDb(failWith) {
  const request = {};
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = {};
      const req = {};
      globalThis.queueMicrotask(() => {
        if (failWith) {
          req.error = failWith;
          req.onerror?.();
        } else {
          tx.oncomplete?.();
        }
      });
      tx.objectStore = () => ({ put: () => req });
      return tx;
    },
  };
  globalThis.indexedDB = {
    open() {
      globalThis.queueMicrotask(() => {
        request.result = db;
        request.onsuccess?.();
      });
      return request;
    },
  };
  return db;
}

async function openedStore(failWith) {
  stubIndexedDb(failWith);
  const store = createIdbStore("test-db", "photos", 1);
  store.open();
  await new Promise((resolve) => globalThis.queueMicrotask(resolve));
  return store;
}

describe("idb.save: переполнение хранилища", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete globalThis.indexedDB;
  });

  it("бросает кодированную ошибку, когда кончилось место", async () => {
    const quota = new Error("The quota has been exceeded.");
    quota.name = "QuotaExceededError";
    const store = await openedStore(quota);

    await expect(store.save("photo_1", new Blob(["x"]))).rejects.toMatchObject({
      code: "DEVICE_OUT_OF_SPACE",
    });
  });

  // Прежний контракт для всего остального: переписывать всех вызывающих ради
  // одного случая было бы дороже, чем он стоит.
  it("возвращает false на прочих отказах", async () => {
    const store = await openedStore(new Error("Internal error"));
    await expect(store.save("photo_1", new Blob(["x"]))).resolves.toBe(false);
  });

  it("возвращает true на успешной записи", async () => {
    const store = await openedStore(null);
    await expect(store.save("photo_1", new Blob(["x"]))).resolves.toBe(true);
  });

  it("возвращает false, когда хранилище не открыто", async () => {
    const store = createIdbStore("test-db", "photos", 1);
    await expect(store.save("photo_1", new Blob(["x"]))).resolves.toBe(false);
  });
});
