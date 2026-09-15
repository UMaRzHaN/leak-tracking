import { describe, expect, it, vi } from "vitest";
import {
  applyPhotoRepairs,
  hasCorruptedPhotoValues,
  saveCorruptedPhotoBlobs,
} from "./photoValueRepair";

const jpeg = (tag) => new Blob([tag], { type: "image/jpeg" });

/**
 * Запись после импорта Excel до исправления: у осмотра вместо пути сам Blob,
 * у записи обхода — тот же Blob, а на телефоне в поле остался бы `{}`.
 */
function corruptedLeak(round = jpeg("round")) {
  return {
    id: "leak-1",
    leak_id: "3830",
    photo: "idb://before",
    monitoringRecords: [{ id: "r-1", photo: round, previousPhoto: {} }],
    events: [
      { id: "leak-1-1", type: "inspection", photo: round },
      { id: "e-repair", type: "repair_started", photo: "idb://repair" },
    ],
  };
}

describe("hasCorruptedPhotoValues", () => {
  it("sees a Blob or an empty object in any photo field", () => {
    expect(hasCorruptedPhotoValues([corruptedLeak()])).toBe(true);
    expect(
      hasCorruptedPhotoValues([{ id: "a", events: [{ photo: {} }] }]),
    ).toBe(true);
  });

  it("stays quiet about paths, gaps and malformed lists", () => {
    expect(
      hasCorruptedPhotoValues([
        {
          id: "a",
          photo: "idb://before",
          photo_after: null,
          events: [null, { id: "e", photo: "data:image/jpeg;base64,eA==" }],
        },
        null,
      ]),
    ).toBe(false);
    expect(hasCorruptedPhotoValues(/** @type {any} */ (null))).toBe(false);
  });
});

describe("saveCorruptedPhotoBlobs", () => {
  it("stores a Blob shared by two fields once, under the import's key", async () => {
    const round = jpeg("round");
    const savePhoto = vi.fn(async (_blob, key) => `idb://photo_p_${key}`);

    const pathByBlob = await saveCorruptedPhotoBlobs(
      [corruptedLeak(round)],
      savePhoto,
    );

    expect(savePhoto).toHaveBeenCalledOnce();
    expect(savePhoto).toHaveBeenCalledWith(round, "3830_monitoring_r-1", {
      contentHash: expect.any(String),
    });
    expect(pathByBlob.get(round)).toBe("idb://photo_p_3830_monitoring_r-1");
  });

  it("leaves out a photo that could not be stored", async () => {
    const round = jpeg("round");

    const pathByBlob = await saveCorruptedPhotoBlobs(
      [corruptedLeak(round)],
      async () => null,
    );

    expect(pathByBlob.has(round)).toBe(false);
  });
});

describe("applyPhotoRepairs", () => {
  it("puts paths in place of stored Blobs and drops other junk", () => {
    const round = jpeg("round");
    const leak = corruptedLeak(round);

    const { leaks, repaired, remaining } = applyPhotoRepairs(
      [leak],
      new Map([[round, "idb://round"]]),
    );

    expect(leaks[0].monitoringRecords[0]).toEqual({
      id: "r-1",
      photo: "idb://round",
    });
    expect(leaks[0].events[0].photo).toBe("idb://round");
    expect(leaks[0].events[1]).toBe(leak.events[1]);
    expect(repaired).toBe(3);
    expect(remaining).toBe(0);
    expect(leak.events[0].photo).toBe(round);
  });

  it("keeps a Blob that was not stored rather than losing the photo", () => {
    const round = jpeg("round");

    const { leaks, repaired, remaining } = applyPhotoRepairs(
      [corruptedLeak(round)],
      new Map(),
    );

    expect(leaks[0].events[0].photo).toBe(round);
    expect(leaks[0].monitoringRecords[0]).not.toHaveProperty("previousPhoto");
    expect(repaired).toBe(1);
    expect(remaining).toBe(2);
  });

  it("returns a leak without junk as the same object", () => {
    const clean = { id: "a", photo: "idb://a", events: [{ photo: "idb://e" }] };

    const { leaks, repaired } = applyPhotoRepairs([clean, null], new Map());

    expect(leaks[0]).toBe(clean);
    expect(leaks[1]).toBeNull();
    expect(repaired).toBe(0);
  });
});
