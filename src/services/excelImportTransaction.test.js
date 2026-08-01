import { describe, expect, it, vi } from "vitest";
import { runExcelImportTransaction } from "./excelImportTransaction";

describe("runExcelImportTransaction", () => {
  it("persists and clears a recoverable operation journal on success", async () => {
    localStorage.clear();
    const projectId = "journal-project";
    await expect(
      runExcelImportTransaction({
        projectId,
        persistPhotos: vi.fn().mockResolvedValue({
          leaks: [{ id: 1 }],
          createdPaths: ["idb://new"],
        }),
        commit: vi.fn().mockImplementation(async () => {
          const pending = JSON.parse(
            localStorage.getItem(`app:${projectId}:import_operation_v1`),
          );
          expect(pending).toMatchObject({
            projectId,
            phase: "committing",
            createdPhotoPaths: ["idb://new"],
          });
        }),
        rollbackState: vi.fn(),
        deletePhoto: vi.fn(),
      }),
    ).resolves.toEqual([{ id: 1 }]);
    expect(
      localStorage.getItem(`app:${projectId}:import_operation_v1`),
    ).toBeNull();
  });

  it("keeps the journal when rollback cannot restore a safe state", async () => {
    localStorage.clear();
    const projectId = "failed-journal-project";
    await expect(
      runExcelImportTransaction({
        projectId,
        persistPhotos: vi.fn().mockResolvedValue({
          leaks: [{ id: 1 }],
          createdPaths: ["idb://new"],
        }),
        commit: vi.fn().mockRejectedValue(new Error("commit failed")),
        rollbackState: vi.fn().mockRejectedValue(new Error("rollback failed")),
        deletePhoto: vi.fn(),
      }),
    ).rejects.toMatchObject({ rollbackError: expect.any(Error) });
    expect(
      JSON.parse(localStorage.getItem(`app:${projectId}:import_operation_v1`)),
    ).toMatchObject({
      phase: "rolling_back",
      createdPhotoPaths: ["idb://new"],
    });
  });

  it("deletes newly created photos after state rollback succeeds", async () => {
    const deletePhoto = vi.fn().mockResolvedValue(true);
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
    const deletePhoto = vi.fn().mockResolvedValue(true);

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

  it("reports a fulfilled false photo deletion as rollback failure", async () => {
    const error = Object.assign(new Error("photo failed"), {
      createdPhotoPaths: ["idb://first"],
    });

    await expect(
      runExcelImportTransaction({
        persistPhotos: vi.fn().mockRejectedValue(error),
        commit: vi.fn(),
        rollbackState: vi.fn(),
        deletePhoto: vi.fn().mockResolvedValue(false),
      }),
    ).rejects.toMatchObject({
      photoRollbackErrors: [expect.objectContaining({ status: "fulfilled" })],
    });
  });
});
