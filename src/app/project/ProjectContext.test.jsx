import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./projectMigration", () => ({
  migrateFromLegacy: vi.fn((projects) => projects),
}));

vi.mock("./projectStorage", async () => {
  const actual = await vi.importActual("./projectStorage");
  return {
    ...actual,
    loadProjects: vi.fn(actual.loadProjects),
    loadActiveId: vi.fn(actual.loadActiveId),
  };
});

const { ProjectProvider, useProject } = await import("./ProjectContext");
const { STORAGE_KEYS } = await import("./storageKeys");
const storageModule = await import("./projectStorage");

describe("ProjectProvider initialization", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("reads projects from storage only once during initial mount", () => {
    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([
        {
          id: "p1",
          name: "Alpha",
          type: "upstream",
          folderName: "alpha",
          createdAt: 1,
        },
      ]),
    );

    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );

    const { result } = renderHook(() => useProject(), { wrapper });

    expect(result.current.projects).toHaveLength(1);
    expect(storageModule.loadProjects).toHaveBeenCalledTimes(1);
    expect(storageModule.loadActiveId).toHaveBeenCalledTimes(1);
  });

  it("falls back to the first project when stored active id is invalid", () => {
    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([
        {
          id: "p1",
          name: "Alpha",
          type: "upstream",
          folderName: "alpha",
          createdAt: 1,
        },
        {
          id: "p2",
          name: "Beta",
          type: "midstream",
          folderName: "beta",
          createdAt: 2,
        },
      ]),
    );
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, "missing-project");

    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );

    const { result } = renderHook(() => useProject(), { wrapper });

    expect(result.current.activeId).toBe("p1");
    expect(result.current.activeProject?.name).toBe("Alpha");
  });

  it("assigns and persists a sync id to a legacy project on demand", () => {
    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([
        {
          id: "p1",
          name: "Alpha",
          type: "upstream",
          folderName: "alpha",
          createdAt: 1,
        },
      ]),
    );
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    let project;
    act(() => {
      project = result.current.ensureProjectSyncId("p1");
    });

    expect(project.syncId).toBeTruthy();
    expect(result.current.activeProject.syncId).toBe(project.syncId);
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST))[0].syncId,
    ).toBe(project.syncId);
  });
});
