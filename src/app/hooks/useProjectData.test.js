import { renderHook, waitFor } from "@testing-library/react";
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
});
