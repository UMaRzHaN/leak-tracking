import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getExcelImportTransactionWarning,
  runExcelImportTransaction,
} from "./excelImportTransaction";

describe("runExcelImportTransaction", () => {
  afterEach(() => vi.restoreAllMocks());

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

  it("fails before mutations when the journal cannot be created", async () => {
    const journalError = new DOMException(
      "quota exceeded",
      "QuotaExceededError",
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw journalError;
    });
    const persistPhotos = vi.fn();
    const commit = vi.fn();

    await expect(
      runExcelImportTransaction({
        projectId: "quota-project",
        persistPhotos,
        commit,
        rollbackState: vi.fn(),
        deletePhoto: vi.fn(),
      }),
    ).rejects.toBe(journalError);
    expect(persistPhotos).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("deletes prepared photos and skips commit when the committing journal write fails", async () => {
    const originalSetItem = Storage.prototype.setItem;
    let writes = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      ...args
    ) {
      writes += 1;
      if (writes >= 2) throw new DOMException("blocked", "SecurityError");
      return originalSetItem.apply(this, args);
    });
    const commit = vi.fn();
    const deletePhoto = vi.fn().mockResolvedValue(true);

    await expect(
      runExcelImportTransaction({
        projectId: "blocked-project",
        persistPhotos: vi.fn().mockResolvedValue({
          leaks: [{ id: 1 }],
          createdPaths: ["idb://prepared"],
        }),
        commit,
        rollbackState: vi.fn(),
        deletePhoto,
      }),
    ).rejects.toMatchObject({
      importCode: "IMPORT_JOURNAL_WRITE_FAILED",
      createdPhotoPaths: ["idb://prepared"],
    });
    expect(commit).not.toHaveBeenCalled();
    expect(deletePhoto).toHaveBeenCalledWith("idb://prepared");
  });

  it("does not let a rolling-back journal error replace the commit error", async () => {
    const originalSetItem = Storage.prototype.setItem;
    let writes = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      ...args
    ) {
      writes += 1;
      if (writes === 3) throw new DOMException("blocked", "SecurityError");
      return originalSetItem.apply(this, args);
    });
    const rootError = new Error("commit failed");
    const rollbackState = vi.fn().mockResolvedValue(undefined);
    const deletePhoto = vi.fn().mockResolvedValue(true);

    await expect(
      runExcelImportTransaction({
        projectId: "rollback-journal-project",
        persistPhotos: vi.fn().mockResolvedValue({
          leaks: [{ id: 1 }],
          createdPaths: ["idb://new"],
        }),
        commit: vi.fn().mockRejectedValue(rootError),
        rollbackState,
        deletePhoto,
      }),
    ).rejects.toBe(rootError);
    expect(rootError.journalRollbackError).toMatchObject({
      name: "SecurityError",
    });
    expect(rollbackState).toHaveBeenCalledOnce();
    expect(deletePhoto).toHaveBeenCalledWith("idb://new");
  });

  it("keeps a successful commit and exposes a warning when journal completion fails", async () => {
    const completionError = new DOMException("blocked", "SecurityError");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw completionError;
    });
    const leaks = [{ id: 1 }];
    const commit = vi.fn().mockResolvedValue(undefined);
    const rollbackState = vi.fn();

    const result = await runExcelImportTransaction({
      projectId: "completion-project",
      persistPhotos: vi.fn().mockResolvedValue({ leaks, createdPaths: [] }),
      commit,
      rollbackState,
      deletePhoto: vi.fn(),
    });

    expect(result).toBe(leaks);
    expect(commit).toHaveBeenCalledOnce();
    expect(rollbackState).not.toHaveBeenCalled();
    expect(getExcelImportTransactionWarning(result)).toMatchObject({
      code: "IMPORT_JOURNAL_COMPLETION_FAILED",
      error: completionError,
    });
    expect(
      JSON.parse(
        localStorage.getItem("app:completion-project:import_operation_v1"),
      ),
    ).toMatchObject({ phase: "committing" });
  });

  it("returns no warning for non-object and ordinary results", () => {
    expect(getExcelImportTransactionWarning(null)).toBeNull();
    expect(getExcelImportTransactionWarning("not-an-object")).toBeNull();
    expect(getExcelImportTransactionWarning([])).toBeNull();
  });

  it("handles a photo persistence failure without created paths or a delete callback", async () => {
    const error = new Error("photo failed before persistence");

    await expect(
      runExcelImportTransaction({
        projectId: "early-photo-failure",
        persistPhotos: vi.fn().mockRejectedValue(error),
        commit: vi.fn(),
        rollbackState: vi.fn(),
      }),
    ).rejects.toBe(error);

    expect(error.photoRollbackErrors).toBeUndefined();
  });

  it("records rejected photo deletions during rollback", async () => {
    const error = Object.assign(new Error("photo failed"), {
      createdPhotoPaths: ["idb://duplicate", "idb://duplicate"],
    });
    const deleteError = new Error("delete failed");
    const deletePhoto = vi.fn().mockRejectedValue(deleteError);

    await expect(
      runExcelImportTransaction({
        projectId: "delete-failure",
        persistPhotos: vi.fn().mockRejectedValue(error),
        commit: vi.fn(),
        rollbackState: vi.fn(),
        deletePhoto,
      }),
    ).rejects.toBe(error);

    expect(deletePhoto).toHaveBeenCalledOnce();
    expect(error.photoRollbackErrors).toEqual([
      expect.objectContaining({ status: "rejected", reason: deleteError }),
    ]);
  });

  it("supports a successful photo transaction without a createdPaths array", async () => {
    const leaks = [{ id: 1 }];

    await expect(
      runExcelImportTransaction({
        projectId: "no-created-paths",
        persistPhotos: vi.fn().mockResolvedValue({ leaks }),
        commit: vi.fn().mockResolvedValue(undefined),
        rollbackState: vi.fn(),
        deletePhoto: vi.fn(),
      }),
    ).resolves.toBe(leaks);
  });

  it("preserves the original commit error when rollback journal completion fails", async () => {
    const completionError = new DOMException("blocked", "SecurityError");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw completionError;
    });
    const rootError = new Error("commit failed");

    await expect(
      runExcelImportTransaction({
        projectId: "rollback-completion-failure",
        persistPhotos: vi.fn().mockResolvedValue({
          leaks: [{ id: 1 }],
          createdPaths: ["idb://new"],
        }),
        commit: vi.fn().mockRejectedValue(rootError),
        rollbackState: vi.fn().mockResolvedValue(undefined),
        deletePhoto: vi.fn().mockResolvedValue(true),
      }),
    ).rejects.toBe(rootError);

    expect(rootError.journalCompletionError).toBe(completionError);
  });
});
