import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";

globalThis.indexedDB = new IDBFactory();

const { idb } = await import("./idb");
const { collectReferencedPhotos, isOldEnough, listWebPhotoSavedAt } =
  await import("./photoGc");

async function openPhotoStore() {
  idb.open();
  await new Promise((resolve) => {
    if (idb.getState().ready) return resolve(undefined);
    const unsubscribe = idb.subscribe(() => {
      if (!idb.getState().ready) return;
      unsubscribe();
      resolve(undefined);
    });
  });
}

describe("isOldEnough", () => {
  it("lets through only photos older than the grace period", () => {
    expect(isOldEnough(1_000, 500, 2_000)).toBe(true);
    expect(isOldEnough(1_800, 500, 2_000)).toBe(false);
  });

  it("keeps a photo whose age is unknown", () => {
    expect(isOldEnough(undefined, 500, 2_000)).toBe(false);
    expect(isOldEnough(0, 500, 2_000)).toBe(false);
    expect(isOldEnough("not a time", 500, 2_000)).toBe(false);
  });
});

describe("collectReferencedPhotos", () => {
  it("collects record, monitoring and event photos", () => {
    const referenced = collectReferencedPhotos([
      {
        photo: "idb://a",
        monitoringRecords: [{ photo: "idb://b" }],
        events: [{ photo: "idb://c" }],
      },
    ]);
    expect([...referenced].sort()).toEqual(["idb://a", "idb://b", "idb://c"]);
  });
});

describe("listWebPhotoSavedAt", () => {
  it("refuses to answer before the photo store is open", async () => {
    await expect(listWebPhotoSavedAt()).rejects.toMatchObject({
      code: "IDB_NOT_READY",
    });
  });

  it("reports when each stored photo was saved", async () => {
    await openPhotoStore();
    const before = Date.now();
    await idb.save("photo_p_a_1", new Blob(["a"]));
    await idb.save("photo_p_b_2", new Blob(["b"]));

    const savedAt = await listWebPhotoSavedAt();

    expect([...savedAt.keys()].sort()).toEqual(["photo_p_a_1", "photo_p_b_2"]);
    for (const time of savedAt.values()) {
      expect(time).toBeGreaterThanOrEqual(before);
    }
  });
});
