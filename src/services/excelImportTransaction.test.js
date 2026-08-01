import { describe, expect, it, vi } from "vitest";
import { runExcelImportTransaction } from "./excelImportTransaction";

describe("runExcelImportTransaction", () => {
  it("deletes newly created photos after state rollback succeeds", async () => {
    const deletePhoto = vi.fn().mockResolvedValue(undefined);
    const rollbackState = vi.fn().mockResolvedValue(undefined);
    const error = new Error("commit failed");

    await expect(
      runExcelImportTransaction({
        persistPhotos: vi.fn().mockResolvedValue({
          leaks: [{ id: 1 }],
          createdPaths: ["idb://new"],
        }),
        commit: vi.fn().mockRejectedValue(error),
        rollbackState,
        deletePhoto,
      }),
    ).rejects.toBe(error);

    expect(rollbackState).toHaveBeenCalledOnce();
    expect(deletePhoto).toHaveBeenCalledWith("idb://new");
  });

  it("preserves photos when state rollback fails", async () => {
    const deletePhoto = vi.fn();
    const rollbackError = new Error("rollback failed");
    const error = new Error("commit failed");

    await expect(
      runExcelImportTransaction({
        persistPhotos: vi.fn().mockResolvedValue({
          leaks: [{ id: 1 }],
          createdPaths: ["idb://new"],
        }),
        commit: vi.fn().mockRejectedValue(error),
        rollbackState: vi.fn().mockRejectedValue(rollbackError),
        deletePhoto,
      }),
    ).rejects.toMatchObject({
      rollbackError,
      createdPhotoPaths: ["idb://new"],
      photosPreserved: true,
    });

    expect(deletePhoto).not.toHaveBeenCalled();
  });

  it("rolls back partial photo persistence without touching state", async () => {
    const error = Object.assign(new Error("photo failed"), {
      createdPhotoPaths: ["idb://first"],
    });
    const rollbackState = vi.fn();
    const deletePhoto = vi.fn().mockResolvedValue(undefined);

    await expect(
      runExcelImportTransaction({
        persistPhotos: vi.fn().mockRejectedValue(error),
        commit: vi.fn(),
        rollbackState,
        deletePhoto,
      }),
    ).rejects.toBe(error);

    expect(rollbackState).not.toHaveBeenCalled();
    expect(deletePhoto).toHaveBeenCalledWith("idb://first");
  });
});
