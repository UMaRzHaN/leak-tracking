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

const projectContextModule = await import("@/app/project/ProjectContext");
const repositoryModule = await import("@/repositories/LeakRepository");
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
});
