import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const mocks = vi.hoisted(() => ({
  settingsProps: null,
  previousProject: {
    id: "project-b",
    name: "Project B",
    type: "upstream",
    folderName: "project_b",
  },
  importedProject: {
    id: "project-copy",
    name: "Imported copy",
    type: "upstream",
    folderName: "imported_copy",
  },
  addProject: vi.fn(),
  overwriteProject: vi.fn(),
  removeProject: vi.fn(),
  save: vi.fn(),
  clearForm: vi.fn(),
  savePhoto: vi.fn(),
  gcOrphanedPhotos: vi.fn(),
  persistExcelImportPhotos: vi.fn(),
  importProjectZip: vi.fn(),
  importIntoExistingProject: vi.fn(),
  rollbackImportedProject: vi.fn(),
  writeProjectSyncState: vi.fn(),
}));

vi.mock("./project/ProjectContext", async () => {
  const React = await import("react");
  return {
    useProject() {
      const [activeProject, setActiveProject] = React.useState(
        mocks.previousProject,
      );
      return {
        isConfigured: true,
        configure: vi.fn(),
        activeProject,
        addProject: (...args) => {
          const project = mocks.addProject(...args);
          if (project) setActiveProject(project);
          return project;
        },
        overwriteProject: (id) => {
          mocks.overwriteProject(id);
          if (id === mocks.previousProject.id) {
            setActiveProject(mocks.previousProject);
            return true;
          }
          return false;
        },
        removeProject: mocks.removeProject,
        setProjectSyncId: vi.fn(),
      };
    },
  };
});

vi.mock("./hooks/useProjectData", () => ({
  useProjectData: () => ({
    data: [],
    dataForPhotoGc: [],
    save: mocks.save,
    clear: vi.fn(),
    dataLoaded: true,
    dataProjectId: mocks.previousProject.id,
    loadError: null,
    loadWarning: null,
    retryLoad: vi.fn(),
  }),
}));

vi.mock("./hooks/useAppState", () => ({
  useAppState: () => ({
    page: "settings",
    prevPage: "",
    setPage: vi.fn(),
    gpsEnabled: false,
    setGpsEnabled: vi.fn(),
    goBack: vi.fn(),
    coords: null,
    geoError: null,
    geoLoading: false,
  }),
}));

vi.mock("./hooks/useUserProfile", () => ({
  useUserProfile: () => ({
    profile: { name: "Inspector" },
    setProfile: vi.fn(),
  }),
}));

vi.mock("./hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

vi.mock("@/features/leakForm/LeakFormContext", () => ({
  useLeakFormContext: () => ({ clearForm: mocks.clearForm }),
}));

vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({
    gcOrphanedPhotos: mocks.gcOrphanedPhotos,
    savePhoto: mocks.savePhoto,
    ready: true,
  }),
}));

vi.mock("@/pages/Settings/Settings", () => ({
  default: (props) => {
    mocks.settingsProps = props;
    return <div>settings-ready</div>;
  },
}));

vi.mock("@/pages/ProjectSetup/ProjectSetupScreen", () => ({
  default: () => null,
}));
vi.mock("@/pages/AddLeak/AddLeak", () => ({ default: () => null }));
vi.mock("@/pages/MainPage/MainPage", () => ({ default: () => null }));
vi.mock("@/pages/DataBase/DataBase", () => ({ default: () => null }));
vi.mock("@/pages/MapPage/MapPage", () => ({ default: () => null }));
vi.mock("@/pages/Monitoring/Monitoring", () => ({ default: () => null }));
vi.mock("@/components/layout/Header/Header", () => ({ default: () => null }));
vi.mock("@/components/layout/Footer/Footer", () => ({ default: () => null }));
vi.mock("@/components/ui/UserProfileSheet/UserProfileSheet", () => ({
  default: () => null,
}));

vi.mock("@/app/project/projectFilters", () => ({
  readProjectFilters: () => ({
    search: "",
    statusFilter: [],
    priorityFilter: [],
    mainLocationFilter: null,
    locationFilter: null,
    nearbyFilter: false,
    nearbyRadius: 100,
    monitoringFilter: "due",
  }),
  writeProjectFilters: vi.fn(),
}));
vi.mock("@/app/project/projectSettings", () => ({
  writeProjectSettings: vi.fn(),
}));
vi.mock("@/app/project/storageKeys", () => ({
  STORAGE_KEYS: {
    PROJECT_VARS: (projectId) => `app:${projectId}:vars`,
  },
}));
vi.mock("@/configs/projects", () => ({
  PROJECTS: {
    upstream: {
      system: { location: { main: "station", secondary: "component" } },
    },
  },
}));
vi.mock("@/utils/monitoringRound", () => ({
  saveMonitoringRound: vi.fn(),
}));
vi.mock("@/services/sync/projectSyncState", () => ({
  writeProjectSyncState: mocks.writeProjectSyncState,
}));
vi.mock("@/services/backup/projectCleanup", () => ({
  rollbackImportedProject: mocks.rollbackImportedProject,
}));
vi.mock("@/services/import/excelImportService", () => ({
  persistExcelImportPhotos: mocks.persistExcelImportPhotos,
}));
vi.mock("@/services/backup/projectBackupService", () => ({
  importProjectZip: mocks.importProjectZip,
  importIntoExistingProject: mocks.importIntoExistingProject,
}));

describe("App import orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settingsProps = null;
    mocks.addProject.mockReturnValue(mocks.importedProject);
    mocks.save.mockResolvedValue(undefined);
    mocks.clearForm.mockReset();
    mocks.gcOrphanedPhotos.mockResolvedValue(undefined);
    mocks.persistExcelImportPhotos.mockResolvedValue([{ id: "leak-1" }]);
    mocks.importProjectZip.mockResolvedValue({
      project: mocks.importedProject,
      leakCount: 1,
    });
    mocks.importIntoExistingProject.mockResolvedValue({
      project: mocks.previousProject,
      leakCount: 1,
    });
    mocks.rollbackImportedProject.mockResolvedValue(undefined);
    mocks.writeProjectSyncState.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("clears the old leak form only after a copied project is fully imported", async () => {
    render(<App />);
    await screen.findByText("settings-ready");

    let pending;
    act(() => {
      pending = mocks.settingsProps.onCreateExcelCopy({
        name: "Imported copy",
        type: "upstream",
        leaks: [{ id: "leak-1" }],
      });
    });
    let result;
    await act(async () => {
      result = await pending;
    });

    expect(result.project).toBe(mocks.importedProject);
    expect(mocks.save).toHaveBeenCalledWith([{ id: "leak-1" }]);
    expect(mocks.clearForm).toHaveBeenCalledOnce();
    expect(mocks.rollbackImportedProject).not.toHaveBeenCalled();
  });

  it("restores the source project and keeps its form when copied-project import fails", async () => {
    const importError = new Error("photo import failed");
    mocks.persistExcelImportPhotos.mockRejectedValue(importError);
    render(<App />);
    await screen.findByText("settings-ready");

    let pending;
    act(() => {
      pending = mocks.settingsProps.onCreateExcelCopy({
        name: "Imported copy",
        type: "upstream",
        leaks: [{ id: "leak-1" }],
      });
    });
    let caught;
    await act(async () => {
      try {
        await pending;
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBe(importError);
    expect(mocks.rollbackImportedProject).toHaveBeenCalledWith(
      mocks.importedProject,
      mocks.removeProject,
    );
    expect(mocks.overwriteProject).toHaveBeenCalledWith(
      mocks.previousProject.id,
    );
    expect(mocks.clearForm).not.toHaveBeenCalled();
  });

  it("keeps Settings mounted under the blocking overlay for an existing-project import", async () => {
    let finishImport;
    mocks.importIntoExistingProject.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishImport = resolve;
        }),
    );
    render(<App />);
    await screen.findByText("settings-ready");

    let pending;
    act(() => {
      pending = mocks.settingsProps.onImportIntoExisting(
        new File(["zip"], "backup.zip"),
        mocks.previousProject,
        "merge",
      );
    });

    expect(screen.getByText("settings-ready")).toBeTruthy();
    expect(
      screen.getByRole("dialog", {
        name: "Importing data, please wait...",
      }).textContent,
    ).toContain("Importing data, please wait");
    await waitFor(() => expect(finishImport).toEqual(expect.any(Function)));

    await act(async () => {
      finishImport({
        project: mocks.previousProject,
        leakCount: 1,
      });
      await pending;
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Importing data, please wait...",
        }),
      ).toBeNull(),
    );
    expect(screen.getByText("settings-ready")).toBeTruthy();
  });

  it("clears the form after importing into a different existing project", async () => {
    const targetProject = {
      id: "project-a",
      name: "Project A",
      type: "upstream",
      folderName: "project_a",
    };
    mocks.importIntoExistingProject.mockResolvedValue({
      project: targetProject,
      leakCount: 2,
    });
    render(<App />);
    await screen.findByText("settings-ready");

    await act(async () => {
      await mocks.settingsProps.onImportIntoExisting(
        new File(["zip"], "backup.zip"),
        targetProject,
        "merge",
      );
    });

    expect(mocks.clearForm).toHaveBeenCalledOnce();
  });

  it("keeps the source form when importing into another project fails", async () => {
    const targetProject = {
      id: "project-a",
      name: "Project A",
      type: "upstream",
      folderName: "project_a",
    };
    const importError = new Error("invalid backup");
    mocks.importIntoExistingProject.mockRejectedValue(importError);
    render(<App />);
    await screen.findByText("settings-ready");

    let caught;
    await act(async () => {
      try {
        await mocks.settingsProps.onImportIntoExisting(
          new File(["zip"], "backup.zip"),
          targetProject,
          "merge",
        );
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBe(importError);
    expect(mocks.clearForm).not.toHaveBeenCalled();
  });
});
