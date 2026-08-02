import { describe, expect, it, vi } from "vitest";
import {
  cleanupUncommittedPhotoReplacements,
  persistPhotoReplacements,
  replaceLeakInCollection,
} from "./persistPhotoReplacements";

describe("persistPhotoReplacements", () => {
  it("deletes replaced photos only after the record is saved", async () => {
    const order = [];
    const save = vi.fn(async () => order.push("saved"));
    const deletePhoto = vi.fn(async () => order.push("deleted"));

    await persistPhotoReplacements({
      save,
      value: { id: 1, photo: "idb://new" },
      replacements: [[true, "idb://old", "idb://new"]],
      deletePhoto,
    });

    expect(order).toEqual(["saved", "deleted"]);
  });

  it("keeps the old photo when saving the record fails", async () => {
    const deletePhoto = vi.fn();

    await expect(
      persistPhotoReplacements({
        save: vi.fn().mockRejectedValue(new Error("database failed")),
        value: { id: 1, photo: "idb://new" },
        replacements: [[true, "idb://old", "idb://new"]],
        deletePhoto,
      }),
    ).rejects.toThrow("database failed");
    expect(deletePhoto).not.toHaveBeenCalled();
  });

  it("keeps a replaced photo referenced by monitoring history", async () => {
    const deletePhoto = vi.fn();

    await persistPhotoReplacements({
      save: vi.fn(),
      value: {
        id: 1,
        photo_after: "idb://new",
        monitoringRecords: [{ photo: "idb://old" }],
      },
      replacements: [[true, "idb://old", "idb://new"]],
      deletePhoto,
    });

    expect(deletePhoto).not.toHaveBeenCalled();
  });

  it("keeps a replaced photo referenced by another leak", async () => {
    const deletePhoto = vi.fn();
    const nextLeak = { id: 1, photo: "idb://new" };
    const referenceLeaks = replaceLeakInCollection(
      [
        { id: 1, photo: "idb://shared" },
        { id: 2, photo_after: "idb://shared" },
      ],
      nextLeak,
    );

    await persistPhotoReplacements({
      save: vi.fn(),
      value: nextLeak,
      referenceLeaks,
      replacements: [[true, "idb://shared", "idb://new"]],
      deletePhoto,
    });

    expect(deletePhoto).not.toHaveBeenCalled();
  });

  it("deletes newly written photos when the record was not committed", async () => {
    const deletePhoto = vi.fn();

    await cleanupUncommittedPhotoReplacements({
      value: { id: 1, photo: "idb://old" },
      replacements: [
        [true, "idb://old", "idb://new"],
        [true, null, "idb://new"],
      ],
      deletePhoto,
    });

    expect(deletePhoto).toHaveBeenCalledOnce();
    expect(deletePhoto).toHaveBeenCalledWith("idb://new");
  });

  it("keeps an uncommitted path that the original record still references", async () => {
    const deletePhoto = vi.fn();

    await cleanupUncommittedPhotoReplacements({
      value: {
        id: 1,
        photo: "idb://old",
        monitoringRecords: [{ photo: "idb://shared" }],
      },
      replacements: [[true, "idb://old", "idb://shared"]],
      deletePhoto,
    });

    expect(deletePhoto).not.toHaveBeenCalled();
  });

  it("keeps an uncommitted path referenced elsewhere in the project", async () => {
    const deletePhoto = vi.fn();

    await cleanupUncommittedPhotoReplacements({
      value: { id: 1, photo: "idb://old" },
      referenceLeaks: [
        { id: 1, photo: "idb://old" },
        { id: 2, monitoringRecords: [{ previousPhoto: "idb://new" }] },
      ],
      replacements: [[true, "idb://old", "idb://new"]],
      deletePhoto,
    });

    expect(deletePhoto).not.toHaveBeenCalled();
  });
});
