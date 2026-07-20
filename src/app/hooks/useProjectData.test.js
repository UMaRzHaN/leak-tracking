import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: vi.fn(),
}));

vi.mock("@/repositories/LeakRepository", () => ({
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

  it("marks data as loaded with empty result when repository read fails", async () => {
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

    expect(result.current.data).toEqual(imported);
    expect(result.current.dataLoaded).toBe(true);
    expect(result.current.dataProjectId).toBe("proj-1");

    await act(async () => {
      finishInitialRead([]);
      await Promise.resolve();
    });

    expect(result.current.data).toEqual(imported);
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
});
