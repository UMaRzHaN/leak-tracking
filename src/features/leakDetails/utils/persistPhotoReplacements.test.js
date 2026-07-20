import { describe, expect, it, vi } from "vitest";
import { persistPhotoReplacements } from "./persistPhotoReplacements";

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
});
