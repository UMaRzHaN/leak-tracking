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
const migrationModule = await import("./projectMigration");

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

  it("uses metadata repaired for an already migrated project immediately", () => {
    const stored = {
      id: "1234",
      name: "Alpha",
      type: "upstream",
      folderName: "Alpha",
      createdAt: 1234,
    };
    localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, JSON.stringify([stored]));
    migrationModule.migrateFromLegacy.mockReturnValueOnce([
      { ...stored, legacyStorageType: "upstream" },
    ]);

    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    expect(result.current.activeProject).toMatchObject({
      id: "1234",
      legacyStorageType: "upstream",
    });
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

  it("replaces and persists a project sync id for manual testing", () => {
    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([
        {
          id: "p1",
          name: "Alpha",
          type: "upstream",
          folderName: "alpha",
          createdAt: 1,
          syncId: "old-sync-1234",
        },
      ]),
    );
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    let project;
    act(() => {
      project = result.current.replaceProjectSyncId("p1", "NEW-SYNC-5678");
    });

    expect(project.syncId).toBe("new-sync-5678");
    expect(result.current.activeProject.syncId).toBe("new-sync-5678");
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST))[0].syncId,
    ).toBe("new-sync-5678");
  });

  it("restores an exact project snapshot during transaction rollback", () => {
    const original = {
      id: "p1",
      name: "Alpha",
      type: "upstream",
      folderName: "alpha",
      createdAt: 1,
    };
    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([original]),
    );
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    act(() => {
      result.current.setProjectSyncId("p1", "temporary-sync-1234");
      result.current.restoreProjectSnapshot("p1", original);
    });

    expect(result.current.activeProject).toEqual(original);
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST)),
    ).toEqual([original]);
  });

  it("drops the native legacy marker when the project type changes", () => {
    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([
        {
          id: "1234",
          name: "Legacy",
          type: "upstream",
          folderName: "upstream",
          createdAt: 1234,
          legacyStorageType: "upstream",
        },
      ]),
    );
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    act(() => result.current.changeProjectType("1234", "midstream"));

    expect(result.current.activeProject).toMatchObject({
      type: "midstream",
    });
    expect(result.current.activeProject).not.toHaveProperty(
      "legacyStorageType",
    );
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST))[0],
    ).not.toHaveProperty("legacyStorageType");
  });

  it("restores archived project metadata without replacing local identity", () => {
    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([
        {
          id: "p1",
          name: "Draft",
          type: "upstream",
          folderName: "draft-folder",
          createdAt: 1,
          syncId: "local-sync-id",
        },
      ]),
    );
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    act(() => {
      result.current.restoreProjectMetadata("p1", {
        name: "Archive project",
        type: "midstream",
        folderName: "archive-folder",
        syncId: "ARCHIVE-SYNC-ID",
      });
    });

    expect(result.current.activeProject).toMatchObject({
      id: "p1",
      name: "Archive project",
      type: "midstream",
      folderName: "draft-folder",
      createdAt: 1,
      syncId: "archive-sync-id",
    });
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST))[0],
    ).toMatchObject({
      id: "p1",
      name: "Archive project",
      type: "midstream",
      folderName: "draft-folder",
      syncId: "archive-sync-id",
    });
  });

  it("creates projects with normalized sync ids and unique folder names", () => {
    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([
        {
          id: "p1",
          name: "Alpha",
          type: "upstream",
          folderName: "Alpha",
          createdAt: 1,
        },
      ]),
    );
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    let created;
    act(() => {
      created = result.current.addProject(" Alpha ", "midstream", {
        syncId: " SYNC-ID-123 ",
      });
    });

    expect(created).toMatchObject({
      name: "Alpha",
      type: "midstream",
      folderName: "Alpha_2",
      syncId: "sync-id-123",
    });
    expect(result.current.activeId).toBe(created.id);
    expect(result.current.projects).toHaveLength(2);
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST)),
    ).toContainEqual(created);
    expect(localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT_ID)).toBe(
      created.id,
    );
  });

  it("caps suffixed duplicate folder names at the storage segment limit", () => {
    const name = "A".repeat(80);
    const base = name.slice(0, 50);
    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([
        {
          id: "p1",
          name,
          type: "upstream",
          folderName: base,
          createdAt: 1,
        },
      ]),
    );
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    let created;
    act(() => {
      created = result.current.addProject(name, "midstream");
    });

    expect(created.folderName).toHaveLength(50);
    expect(created.folderName).toMatch(/_2$/);
  });

  it("keeps both projects created in the same event turn", () => {
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    let first;
    let second;
    act(() => {
      first = result.current.addProject("First", "upstream");
      second = result.current.addProject("Second", "midstream");
    });

    expect(first.id).not.toBe(second.id);
    expect(result.current.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, name: "First" }),
        expect.objectContaining({ id: second.id, name: "Second" }),
      ]),
    );
  });

  it("rejects unknown project types without changing state", () => {
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    let created;
    act(() => {
      created = result.current.addProject("Invalid", "unknown");
    });

    expect(created).toBeNull();
    expect(result.current.projects).toEqual([]);
    expect(result.current.isConfigured).toBe(false);
  });

  it("renames a project in two phases and resolves folder collisions", () => {
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
          folderName: "Beta",
          createdAt: 2,
        },
      ]),
    );
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    let rename;
    act(() => {
      rename = result.current.renameProject("p1", " Beta ");
    });

    expect(rename).toEqual({
      oldFolderName: "alpha",
      newFolderName: "Beta_2",
    });
    expect(result.current.projects[0]).toMatchObject({
      name: "Beta",
      folderName: "alpha",
    });

    act(() => {
      result.current.applyFolderRename("p1", rename.newFolderName);
    });
    expect(result.current.projects[0].folderName).toBe("Beta_2");
  });

  it("switches projects, changes type, and ignores invalid targets", () => {
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
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    act(() => result.current.selectProject("missing"));
    expect(result.current.activeId).toBe("p1");

    act(() => result.current.selectProject("p2"));
    expect(result.current.activeId).toBe("p2");

    act(() => result.current.changeProject("downstream"));
    expect(result.current.activeProject.type).toBe("downstream");

    act(() => result.current.changeProjectType("p2", "unknown"));
    expect(result.current.activeProject.type).toBe("downstream");
    expect(result.current.overwriteProject("missing")).toBe(false);
  });

  it("removes the active project and activates the first remaining project", () => {
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
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, "p2");
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    act(() => result.current.removeProject("p2"));

    expect(result.current.projects.map((project) => project.id)).toEqual([
      "p1",
    ]);
    expect(result.current.activeId).toBe("p1");
    expect(localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT_ID)).toBe("p1");
  });

  it("protects an existing sync id from accidental replacement", () => {
    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([
        {
          id: "p1",
          name: "Alpha",
          type: "upstream",
          folderName: "alpha",
          createdAt: 1,
          syncId: "original-sync",
        },
      ]),
    );
    const wrapper = ({ children }) => (
      <ProjectProvider>{children}</ProjectProvider>
    );
    const { result } = renderHook(() => useProject(), { wrapper });

    expect(result.current.setProjectSyncId("p1", "other-sync")).toBeNull();
    expect(result.current.replaceProjectSyncId("p1", "short")).toBeNull();
    expect(result.current.ensureProjectSyncId("missing")).toBeNull();
    expect(result.current.activeProject.syncId).toBe("original-sync");
  });
});
