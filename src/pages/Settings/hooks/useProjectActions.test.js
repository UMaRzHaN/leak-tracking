import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: vi.fn(),
}));

vi.mock("@/app/project/ProjectContext", () => ({
  useProject: vi.fn(),
}));

vi.mock("@/features/leakForm/LeakFormContext", () => ({
  useLeakFormContext: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({
  isNative: false,
}));

vi.mock("@/services/maps/tileCache", () => ({
  clearMapCache: vi.fn(),
}));

vi.mock("@/repositories/PhotoRepository", () => ({
  PhotoRepository: {
    deleteProjectPhotos: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/repositories/LeakRepository", () => ({
  LeakRepository: {
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

const languageModule = await import("@/app/hooks/useLanguage");
const projectModule = await import("@/app/project/ProjectContext");
const formContextModule = await import("@/features/leakForm/LeakFormContext");
const tileCacheModule = await import("@/services/maps/tileCache");
const photoRepositoryModule = await import("@/repositories/PhotoRepository");
const leakRepositoryModule = await import("@/repositories/LeakRepository");
const { useProjectActions, remapProjectPhotoPaths } =
  await import("./useProjectActions");

describe("remapProjectPhotoPaths", () => {
  it("updates every native photo reference after a project folder rename", () => {
    const oldBase = "data://LeakReports/alpha/photos/";
    const leaks = [
      {
        id: 1,
        photo: `${oldBase}before.jpg`,
        photo_after: `${oldBase}after.jpg`,
        photo_repair: `${oldBase}repair.jpg`,
        monitoringRecords: [
          { id: "m1", photo: `${oldBase}monitoring.jpg` },
          { id: "m2", photo: "idb://unchanged" },
        ],
      },
    ];

    const [updated] = remapProjectPhotoPaths(leaks, "alpha", "alpha_renamed");

    expect(updated.photo).toContain("LeakReports/alpha_renamed/photos/");
    expect(updated.photo_after).toContain("LeakReports/alpha_renamed/photos/");
    expect(updated.photo_repair).toContain("LeakReports/alpha_renamed/photos/");
    expect(updated.monitoringRecords[0].photo).toContain(
      "LeakReports/alpha_renamed/photos/",
    );
    expect(updated.monitoringRecords[1].photo).toBe("idb://unchanged");
    expect(leaks[0].photo).toBe(`${oldBase}before.jpg`);
  });
});

describe("useProjectActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    languageModule.useLanguage.mockReturnValue({ lang: "en" });
    formContextModule.useLeakFormContext.mockReturnValue({
      form: {},
      clearForm: vi.fn(),
    });
    projectModule.useProject.mockReturnValue({
      projects: [
        { id: "p1", name: "Alpha", folderName: "alpha" },
        { id: "p2", name: "Beta", folderName: "beta" },
      ],
      activeProject: { id: "p1", name: "Alpha", folderName: "alpha" },
      addProject: vi.fn(),
      selectProject: vi.fn(),
      renameProject: vi.fn(),
      applyFolderRename: vi.fn(),
      removeProject: vi.fn(),
      replaceProjectSyncId: vi.fn(),
    });
    tileCacheModule.clearMapCache.mockResolvedValue(undefined);
  });

  it("opens confirmation state instead of switching immediately when form is dirty", async () => {
    const notify = vi.fn();
    const setCacheInfo = vi.fn();
    const selectProject = vi.fn();
    const clearForm = vi.fn();

    projectModule.useProject.mockReturnValue({
      ...projectModule.useProject(),
      selectProject,
    });
    formContextModule.useLeakFormContext.mockReturnValue({
      form: { component: "Valve" },
      clearForm,
    });

    const { result } = renderHook(() =>
      useProjectActions({ setCacheInfo, notify }),
    );

    await act(async () => {
      await result.current.handleSelect("p2");
    });

    expect(selectProject).not.toHaveBeenCalled();
    expect(clearForm).not.toHaveBeenCalled();
    expect(tileCacheModule.clearMapCache).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(result.current.projectSwitchState.open).toBe(true);
    expect(result.current.projectSwitchState.nextProjectId).toBe("p2");
  });

  it("switches project, clears form and cache after explicit confirmation", async () => {
    const notify = vi.fn();
    const setCacheInfo = vi.fn();
    const selectProject = vi.fn();
    const clearForm = vi.fn();

    projectModule.useProject.mockReturnValue({
      ...projectModule.useProject(),
      selectProject,
    });
    formContextModule.useLeakFormContext.mockReturnValue({
      form: { component: "Valve" },
      clearForm,
    });

    const { result } = renderHook(() =>
      useProjectActions({ setCacheInfo, notify }),
    );

    await act(async () => {
      await result.current.handleSelect("p2");
    });

    await act(async () => {
      await result.current.confirmProjectSwitch();
    });

    expect(selectProject).toHaveBeenCalledWith("p2");
    expect(clearForm).toHaveBeenCalled();
    expect(tileCacheModule.clearMapCache).toHaveBeenCalled();
    expect(setCacheInfo).toHaveBeenCalledWith({ count: 0, sizeMB: 0 });
    expect(notify).toHaveBeenCalledWith(
      "info",
      "Project switched, map cache cleared",
    );
    expect(result.current.projectSwitchState.open).toBe(false);
  });

  it("ignores the active project and can cancel a pending switch", async () => {
    const selectProject = vi.fn();
    projectModule.useProject.mockReturnValue({
      ...projectModule.useProject(),
      selectProject,
    });
    formContextModule.useLeakFormContext.mockReturnValue({
      form: { component: "Valve" },
      clearForm: vi.fn(),
    });
    const { result } = renderHook(() =>
      useProjectActions({ setCacheInfo: vi.fn(), notify: vi.fn() }),
    );

    await act(async () => result.current.handleSelect("p1"));
    expect(selectProject).not.toHaveBeenCalled();

    await act(async () => result.current.handleSelect("p2"));
    act(() => result.current.cancelProjectSwitch());
    expect(result.current.projectSwitchState).toMatchObject({
      open: false,
      nextProjectId: null,
    });
    await act(async () => result.current.confirmProjectSwitch());
    expect(selectProject).not.toHaveBeenCalled();
  });

  it("applies folder rename and shows success notification on web", async () => {
    const notify = vi.fn();
    const renameProject = vi.fn().mockReturnValue({
      oldFolderName: "alpha",
      newFolderName: "alpha_renamed",
    });
    const applyFolderRename = vi.fn();

    projectModule.useProject.mockReturnValue({
      ...projectModule.useProject(),
      renameProject,
      applyFolderRename,
    });

    const { result } = renderHook(() =>
      useProjectActions({ setCacheInfo: vi.fn(), notify }),
    );

    await act(async () => {
      await result.current.handleRename("p1", "Alpha Renamed");
    });

    expect(renameProject).toHaveBeenCalledWith("p1", "Alpha Renamed");
    expect(applyFolderRename).toHaveBeenCalledWith("p1", "alpha_renamed");
    expect(notify).toHaveBeenCalledWith("success", "Name saved");
  });

  it("does nothing when the project rename is rejected", async () => {
    const notify = vi.fn();
    const renameProject = vi.fn().mockReturnValue(null);
    const applyFolderRename = vi.fn();
    projectModule.useProject.mockReturnValue({
      ...projectModule.useProject(),
      renameProject,
      applyFolderRename,
    });
    const { result } = renderHook(() =>
      useProjectActions({ setCacheInfo: vi.fn(), notify }),
    );

    await act(async () => result.current.handleRename("p1", ""));

    expect(applyFolderRename).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("creates project with fallback title in notification when name is empty", () => {
    const notify = vi.fn();
    const addProject = vi.fn();

    projectModule.useProject.mockReturnValue({
      ...projectModule.useProject(),
      addProject,
    });

    const { result } = renderHook(() =>
      useProjectActions({ setCacheInfo: vi.fn(), notify }),
    );

    act(() => {
      result.current.handleAdd("", "upstream");
    });

    expect(addProject).toHaveBeenCalledWith("", "upstream");
    expect(notify).toHaveBeenCalledWith(
      "success",
      'Project "Upstream" created',
    );
  });

  it("opens the sync id editor and saves its value", () => {
    const notify = vi.fn();
    const replaceProjectSyncId = vi.fn().mockReturnValue({
      id: "p1",
      syncId: "sync-shared-1234",
    });

    projectModule.useProject.mockReturnValue({
      ...projectModule.useProject(),
      replaceProjectSyncId,
    });

    const { result } = renderHook(() =>
      useProjectActions({ setCacheInfo: vi.fn(), notify }),
    );

    act(() => {
      result.current.handleChangeSyncId("p1", "old-sync-1234");
    });

    expect(result.current.syncIdEditorState.open).toBe(true);
    expect(result.current.syncIdEditorState.value).toBe("old-sync-1234");

    act(() => {
      result.current.updateSyncIdEditorValue("SYNC-SHARED-1234");
    });
    act(() => {
      result.current.confirmSyncIdEditor();
    });

    expect(replaceProjectSyncId).toHaveBeenCalledWith("p1", "sync-shared-1234");
    expect(notify).toHaveBeenCalledWith("success", "Project syncId updated");
    expect(result.current.syncIdEditorState.open).toBe(false);
  });

  it("rejects too-short sync id editor input", () => {
    const notify = vi.fn();
    const replaceProjectSyncId = vi.fn();

    projectModule.useProject.mockReturnValue({
      ...projectModule.useProject(),
      replaceProjectSyncId,
    });

    const { result } = renderHook(() =>
      useProjectActions({ setCacheInfo: vi.fn(), notify }),
    );

    act(() => {
      result.current.handleChangeSyncId("p1", "old-sync-1234");
    });
    act(() => {
      result.current.updateSyncIdEditorValue("short");
    });
    act(() => {
      result.current.confirmSyncIdEditor();
    });

    expect(replaceProjectSyncId).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      "warning",
      "syncId must be at least 8 characters",
    );
    expect(result.current.syncIdEditorState.open).toBe(true);
  });

  it("keeps the sync id editor open when persistence fails and supports cancel", () => {
    const notify = vi.fn();
    const replaceProjectSyncId = vi.fn().mockReturnValue(null);
    projectModule.useProject.mockReturnValue({
      ...projectModule.useProject(),
      replaceProjectSyncId,
    });
    const { result } = renderHook(() =>
      useProjectActions({ setCacheInfo: vi.fn(), notify }),
    );

    act(() => result.current.handleChangeSyncId("p1", "sync-alpha-1234"));
    act(() => result.current.confirmSyncIdEditor());
    expect(notify).toHaveBeenCalledWith(
      "error",
      "Could not update project syncId",
    );
    expect(result.current.syncIdEditorState.open).toBe(true);

    act(() => result.current.cancelSyncIdEditor());
    expect(result.current.syncIdEditorState).toMatchObject({
      open: false,
      projectId: null,
      value: "",
    });
    act(() => result.current.confirmSyncIdEditor());
    expect(replaceProjectSyncId).toHaveBeenCalledTimes(1);
  });

  it("removes project artifacts before removing a project", async () => {
    const notify = vi.fn();
    const removeProject = vi.fn();

    localStorage.setItem("app:p1:data_v1", "[]");
    localStorage.setItem("app:p1:vars_v1", "{}");
    localStorage.setItem("app:p1:hidden_fields_v1", "[]");
    localStorage.setItem("app:p1:settings_updated_at_v1", "100");

    projectModule.useProject.mockReturnValue({
      ...projectModule.useProject(),
      removeProject,
    });

    const { result } = renderHook(() =>
      useProjectActions({ setCacheInfo: vi.fn(), notify }),
    );

    await act(async () => {
      await result.current.handleRemove("p1");
    });

    expect(localStorage.getItem("app:p1:data_v1")).toBeNull();
    expect(localStorage.getItem("app:p1:vars_v1")).toBeNull();
    expect(localStorage.getItem("app:p1:hidden_fields_v1")).toBeNull();
    expect(localStorage.getItem("app:p1:settings_updated_at_v1")).toBeNull();
    expect(leakRepositoryModule.LeakRepository.clear).toHaveBeenCalledWith({
      projectId: "p1",
      folderName: "alpha",
    });
    expect(
      photoRepositoryModule.PhotoRepository.deleteProjectPhotos,
    ).toHaveBeenCalledWith("p1", "alpha");
    expect(removeProject).toHaveBeenCalledWith("p1");
  });

  it("ignores removal of an unknown project", async () => {
    const notify = vi.fn();
    const removeProject = vi.fn();
    projectModule.useProject.mockReturnValue({
      ...projectModule.useProject(),
      removeProject,
    });
    const { result } = renderHook(() =>
      useProjectActions({ setCacheInfo: vi.fn(), notify }),
    );

    await act(async () => result.current.handleRemove("missing"));

    expect(leakRepositoryModule.LeakRepository.clear).not.toHaveBeenCalled();
    expect(removeProject).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
