import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: vi.fn(),
}));

vi.mock("@/repositories/LeakRepository", () => ({
  getPreservedInvalidLeakRecords: vi.fn(() => []),
  LeakRepository: {
    getAll: vi.fn(),
    saveAll: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock("@/repositories/PhotoRepository", () => ({
  PhotoRepository: {
    gcOrphaned: vi.fn(),
  },
}));

vi.mock("@/services/projectSyncState", () => ({
  recordLeakDeletions: vi.fn(),
}));

const projectContextModule = await import("@/app/project/ProjectContext");
const repositoryModule = await import("@/repositories/LeakRepository");
const photoRepositoryModule = await import("@/repositories/PhotoRepository");
const syncStateModule = await import("@/services/projectSyncState");
const { useProjectData } = await import("./useProjectData");

describe("useProjectData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectContextModule.useProjectData.mockReturnValue({
      activeProject: {
        id: "proj-1",
        folderName: "project_one",
      },
    });
  });

  it("blocks writes and retries when repository read fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    repositoryModule.LeakRepository.getAll.mockRejectedValueOnce(
      new Error("read failed"),
    );

    const { result } = renderHook(() => useProjectData());

    await waitFor(() => {
      expect(result.current.dataLoaded).toBe(true);
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.dataProjectId).toBe("proj-1");

    expect(result.current.loadError).toMatchObject({ message: "read failed" });
    expect(result.current.canWrite).toBe(false);

    await act(async () => {
      await expect(result.current.save([])).rejects.toMatchObject({
        code: "PROJECT_DATA_WRITE_BLOCKED",
      });
    });
    expect(repositoryModule.LeakRepository.saveAll).not.toHaveBeenCalled();

    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce([
      { id: "recovered", status: "open" },
    ]);
    act(() => result.current.retryLoad());

    await waitFor(() => {
      expect(result.current.data).toEqual([
        { id: "recovered", status: "open" },
      ]);
    });
    expect(result.current.loadError).toBeNull();
    errorSpy.mockRestore();
  });

  it("loads repository data for the active project", async () => {
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce([
      { id: "l1", lat: 1, lng: 2, status: "open" },
    ]);

    const { result } = renderHook(() => useProjectData());

    await waitFor(() => {
      expect(result.current.dataLoaded).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].id).toBe("l1");
    expect(result.current.dataProjectId).toBe("proj-1");
  });

  it("forwards the explicit legacy-storage marker during the initial read", async () => {
    projectContextModule.useProjectData.mockReturnValue({
      activeProject: {
        id: "1234",
        folderName: "North_Field",
        legacyStorageType: "upstream",
      },
    });
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce([]);

    renderHook(() => useProjectData());

    await waitFor(() => {
      expect(repositoryModule.LeakRepository.getAll).toHaveBeenCalledWith({
        projectId: "1234",
        folderName: "North_Field",
        legacyStorageType: "upstream",
      });
    });
  });

  it("does not let a pending initial read erase data saved by Excel import", async () => {
    let finishInitialRead;
    repositoryModule.LeakRepository.getAll.mockReturnValueOnce(
      new Promise((resolve) => {
        finishInitialRead = resolve;
      }),
    );
    repositoryModule.LeakRepository.saveAll.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useProjectData());
    const imported = [{ id: "excel-1", leak_id: "TAG-1", status: "open" }];

    await act(async () => {
      await result.current.save(imported);
    });

    expect(result.current.data).toEqual([expect.objectContaining(imported[0])]);
    expect(result.current.dataLoaded).toBe(true);
    expect(result.current.dataProjectId).toBe("proj-1");

    await act(async () => {
      finishInitialRead([]);
      await Promise.resolve();
    });

    expect(result.current.data).toEqual([expect.objectContaining(imported[0])]);
    expect(result.current.dataLoaded).toBe(true);
    expect(result.current.dataProjectId).toBe("proj-1");
  });

  it("finishes immediately when there is no active project", async () => {
    projectContextModule.useProjectData.mockReturnValue({
      activeProject: null,
    });

    const { result } = renderHook(() => useProjectData());

    await waitFor(() => expect(result.current.dataLoaded).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(result.current.dataProjectId).toBeNull();
    expect(repositoryModule.LeakRepository.getAll).not.toHaveBeenCalled();
  });

  it("ignores a late response from the previously active project", async () => {
    let resolveFirstProject;
    repositoryModule.LeakRepository.getAll
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstProject = resolve;
        }),
      )
      .mockResolvedValueOnce([{ id: "project-2-leak" }]);

    const { result, rerender } = renderHook(() => useProjectData());
    projectContextModule.useProjectData.mockReturnValue({
      activeProject: { id: "proj-2", folderName: "project_two" },
    });
    rerender();

    await waitFor(() => expect(result.current.dataProjectId).toBe("proj-2"));
    expect(result.current.data).toEqual([{ id: "project-2-leak" }]);

    await act(async () => {
      resolveFirstProject([{ id: "stale-project-1-leak" }]);
      await Promise.resolve();
    });

    expect(result.current.dataProjectId).toBe("proj-2");
    expect(result.current.data).toEqual([{ id: "project-2-leak" }]);
  });

  it("continues the save queue after a previous repository write fails", async () => {
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce([]);
    repositoryModule.LeakRepository.saveAll
      .mockRejectedValueOnce(new Error("first write failed"))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.dataLoaded).toBe(true));

    let firstSave;
    let secondSave;
    act(() => {
      firstSave = result.current.save([{ id: "first" }]);
      secondSave = result.current.save([{ id: "second" }]);
    });

    await expect(firstSave).rejects.toThrow("first write failed");
    await expect(secondSave).resolves.toBeUndefined();
    expect(repositoryModule.LeakRepository.saveAll).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual([{ id: "second" }]);
  });

  it("waits for queued saves before clearing the repository", async () => {
    let finishSave;
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce([]);
    repositoryModule.LeakRepository.saveAll.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    repositoryModule.LeakRepository.clear.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.dataLoaded).toBe(true));

    let savePromise;
    let clearPromise;
    act(() => {
      savePromise = result.current.save([{ id: "pending" }]);
      clearPromise = result.current.clear();
    });

    await Promise.resolve();
    expect(repositoryModule.LeakRepository.clear).not.toHaveBeenCalled();

    finishSave();
    await act(async () => {
      await savePromise;
      await clearPromise;
    });

    expect(repositoryModule.LeakRepository.clear).toHaveBeenCalledOnce();
    expect(
      repositoryModule.LeakRepository.saveAll.mock.invocationCallOrder[0],
    ).toBeLessThan(
      repositoryModule.LeakRepository.clear.mock.invocationCallOrder[0],
    );
    expect(result.current.data).toEqual([]);
  });

  it("does not roll a newer empty save back when an earlier clear fails", async () => {
    const original = [{ id: "stored" }];
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce(original);
    repositoryModule.LeakRepository.clear.mockRejectedValueOnce(
      new Error("clear failed"),
    );
    repositoryModule.LeakRepository.saveAll.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.data).toEqual(original));

    let clearResult;
    let latestSave;
    act(() => {
      clearResult = result.current.clear().catch((error) => error);
      latestSave = result.current.save([]);
    });

    await act(async () => {
      expect(await clearResult).toMatchObject({ message: "clear failed" });
      await latestSave;
    });

    expect(result.current.data).toEqual([]);
    expect(repositoryModule.LeakRepository.saveAll).toHaveBeenCalledWith([], {
      projectId: "proj-1",
      folderName: "project_one",
    });
  });

  it("records deletions and clears the active project repository", async () => {
    const stored = [{ id: "l1" }, { id: "l2" }];
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce(stored);
    repositoryModule.LeakRepository.clear.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.data).toEqual(stored));

    await act(async () => result.current.clear());

    expect(syncStateModule.recordLeakDeletions).toHaveBeenCalledWith(
      "proj-1",
      stored,
      [],
    );
    expect(repositoryModule.LeakRepository.clear).toHaveBeenCalledWith({
      projectId: "proj-1",
      folderName: "project_one",
    });
    expect(
      photoRepositoryModule.PhotoRepository.gcOrphaned,
    ).toHaveBeenCalledWith([], {
      projectId: "proj-1",
      folderName: "project_one",
    });
    expect(result.current.data).toEqual([]);
    expect(result.current.dataProjectId).toBe("proj-1");
  });

  it("updates local state without persistence when project identity is incomplete", async () => {
    projectContextModule.useProjectData.mockReturnValue({
      activeProject: { id: "proj-1", folderName: null },
    });
    const { result } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.dataLoaded).toBe(true));

    await act(async () => result.current.save([{ id: "local-only" }]));
    await act(async () => result.current.clear());

    expect(repositoryModule.LeakRepository.saveAll).not.toHaveBeenCalled();
    expect(repositoryModule.LeakRepository.clear).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([]);
  });

  it("rolls local state back when the latest save fails", async () => {
    const original = [{ id: "stored" }];
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce(original);
    repositoryModule.LeakRepository.saveAll.mockRejectedValueOnce(
      new Error("disk full"),
    );
    const { result } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.data).toEqual(original));

    let pending;
    act(() => {
      pending = result.current.save([{ id: "changed" }]);
    });
    expect(result.current.data).toEqual([{ id: "changed" }]);
    await act(async () => {
      await expect(pending).rejects.toThrow("disk full");
    });
    expect(result.current.data).toEqual(original);
  });

  it("publishes non-optimistic changes only after repository commit", async () => {
    const original = [{ id: "stored", status: "resolved" }];
    const changed = [{ id: "stored", status: "open" }];
    let finishSave;
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce(original);
    repositoryModule.LeakRepository.saveAll.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    const { result } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.data).toEqual(original));

    let pending;
    act(() => {
      pending = result.current.save(changed, { optimistic: false });
    });
    expect(result.current.data).toEqual(original);

    finishSave();
    await act(async () => pending);

    expect(result.current.data).toEqual([
      expect.objectContaining({ id: "stored", status: "open" }),
    ]);
  });

  it("does not publish an older non-optimistic commit over a newer optimistic save", async () => {
    const original = [{ id: "stored", status: "open" }];
    const firstChange = [{ id: "stored", status: "in_progress" }];
    const latestChange = [{ id: "stored", status: "resolved" }];
    let finishFirstSave;
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce(original);
    repositoryModule.LeakRepository.saveAll
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirstSave = resolve;
        }),
      )
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.data).toEqual(original));

    let firstPending;
    let latestPending;
    act(() => {
      firstPending = result.current.save(firstChange, { optimistic: false });
      latestPending = result.current.save(latestChange);
    });
    expect(result.current.data).toEqual([
      expect.objectContaining({ id: "stored", status: "resolved" }),
    ]);

    finishFirstSave();
    await act(async () => {
      await firstPending;
      await latestPending;
    });

    expect(result.current.data).toEqual([
      expect.objectContaining({ id: "stored", status: "resolved" }),
    ]);
    expect(
      repositoryModule.LeakRepository.saveAll.mock.calls.at(-1)[0],
    ).toEqual([expect.objectContaining({ id: "stored", status: "resolved" })]);
  });

  it("rolls a failed optimistic save back to the latest queued commit", async () => {
    const original = [{ id: "stored", status: "open" }];
    const committedChange = [{ id: "stored", status: "in_progress" }];
    const failedChange = [{ id: "stored", status: "resolved" }];
    let finishFirstSave;
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce(original);
    repositoryModule.LeakRepository.saveAll
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirstSave = resolve;
        }),
      )
      .mockRejectedValueOnce(new Error("second write failed"));
    const { result } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.data).toEqual(original));

    let committedPending;
    let failedPending;
    act(() => {
      committedPending = result.current.save(committedChange, {
        optimistic: false,
      });
      failedPending = result.current.save(failedChange);
    });

    finishFirstSave();
    await act(async () => {
      await committedPending;
      await expect(failedPending).rejects.toThrow("second write failed");
    });

    expect(result.current.data).toEqual([
      expect.objectContaining({ id: "stored", status: "in_progress" }),
    ]);
  });

  it("keeps committed data when sync metadata persistence fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = [{ id: "stored" }];
    const changed = [{ id: "changed" }];
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce(original);
    repositoryModule.LeakRepository.saveAll.mockResolvedValueOnce(undefined);
    syncStateModule.recordLeakDeletions.mockImplementationOnce(() => {
      throw new Error("localStorage unavailable");
    });
    const { result } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.data).toEqual(original));

    await act(async () => result.current.save(changed));

    expect(result.current.data).toEqual(changed);
    errorSpy.mockRestore();
  });

  it("keeps data cleared when post-commit cleanup fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = [{ id: "stored" }];
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce(original);
    repositoryModule.LeakRepository.clear.mockResolvedValueOnce(undefined);
    syncStateModule.recordLeakDeletions.mockImplementationOnce(() => {
      throw new Error("localStorage unavailable");
    });
    photoRepositoryModule.PhotoRepository.gcOrphaned.mockRejectedValueOnce(
      new Error("photo cleanup failed"),
    );
    const { result } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.data).toEqual(original));

    await act(async () => result.current.clear());

    expect(result.current.data).toEqual([]);
    errorSpy.mockRestore();
  });

  it("preserves invalid records in storage and photo GC input", async () => {
    const visible = [{ id: "valid", status: "open" }];
    const preserved = [{ id: "future", status: "future-status" }];
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce(visible);
    repositoryModule.getPreservedInvalidLeakRecords.mockReturnValueOnce(
      preserved,
    );
    repositoryModule.LeakRepository.saveAll.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.data).toEqual(visible));

    expect(result.current.dataForPhotoGc).toEqual([...visible, ...preserved]);
    await act(async () => result.current.save(visible));
    expect(repositoryModule.LeakRepository.saveAll).toHaveBeenCalledWith(
      [...visible, ...preserved],
      { projectId: "proj-1", folderName: "project_one" },
    );
  });
  it("hides the previous project immediately while the next project loads", async () => {
    repositoryModule.LeakRepository.getAll.mockResolvedValueOnce([
      { id: "old-project-record" },
    ]);
    const { result, rerender } = renderHook(() => useProjectData());
    await waitFor(() => expect(result.current.dataLoaded).toBe(true));

    repositoryModule.LeakRepository.getAll.mockReturnValueOnce(
      new Promise(() => {}),
    );
    projectContextModule.useProjectData.mockReturnValue({
      activeProject: { id: "proj-2", folderName: "project_two" },
    });
    rerender();

    expect(result.current.data).toEqual([{ id: "old-project-record" }]);
    expect(result.current.dataLoaded).toBe(false);
    expect(result.current.dataProjectId).toBe("proj-1");
  });
});
