import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMapCacheInfo: vi.fn(),
  clearMapCache: vi.fn(),
  clearDatabase: vi.fn(),
  setVars: vi.fn(),
  setHiddenFields: vi.fn(),
  setMonitoringExportMode: vi.fn(),
  setLeakPhotoRequired: vi.fn(),
  setMonitoringPhotoRequired: vi.fn(),
  handleAdd: vi.fn(),
  handleSelect: vi.fn(),
  handleRename: vi.fn(),
  handleRemove: vi.fn(),
  handleChangeSyncId: vi.fn(),
  handleExportZip: vi.fn(),
  handleImportZip: vi.fn(),
}));

vi.mock("@/services/maps/tileCache", () => ({
  getMapCacheInfo: mocks.getMapCacheInfo,
  clearMapCache: mocks.clearMapCache,
}));
vi.mock("@/app/project/hooks/useProjectVars", () => ({
  useProjectVars: () => ({ vars: {}, setVars: mocks.setVars }),
}));
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ getPhoto: vi.fn(), savePhoto: vi.fn() }),
}));
vi.mock("@/app/project/hooks/useProjectConfig", () => ({
  useProjectConfig: () => ({ fields: [], export: { excel: {} } }),
}));
vi.mock("@/app/project/hooks/useHiddenFields", () => ({
  useHiddenFields: () => ({
    hiddenFields: new Set(),
    setHiddenFields: mocks.setHiddenFields,
  }),
}));
vi.mock("@/app/project/hooks/useExcelExportMode", () => ({
  useExcelExportMode: () => ({
    monitoringExportMode: "all",
    setMonitoringExportMode: mocks.setMonitoringExportMode,
  }),
}));
vi.mock("@/app/project/hooks/usePhotoRequirements", () => ({
  usePhotoRequirements: () => ({
    leakPhotoRequired: false,
    monitoringPhotoRequired: false,
    setLeakPhotoRequired: mocks.setLeakPhotoRequired,
    setMonitoringPhotoRequired: mocks.setMonitoringPhotoRequired,
  }),
}));
vi.mock("./hooks/useSettingsTexts", () => ({
  useSettingsTexts: () => ({
    lang: "en",
    t: (key, options) => `${key}:${options?.count ?? ""}`,
    toggleLanguage: vi.fn(),
    localeTexts: {
      title: "Settings",
      projects: "Projects",
      addProject: "Add project",
      noProjects: "No projects",
      clearMapCache: "Clear map cache",
      clearDatabase: "Clear database",
      dialogs: {
        clearMapCache: "Clear cached tiles",
        clearDatabase: "Clear records",
      },
      notifications: {
        excelExportModeSaved: "Export mode saved",
        allFieldsActive: "All fields active",
        cacheCleared: "Cache cleared",
        databaseCleared: "Database cleared",
      },
      confirm: {
        clearMapCacheTitle: "Clear map cache",
        clearMapCacheDescription: "Clear cached tiles",
        clearDatabaseTitle: "Clear database",
        clearDatabaseDescription: "Clear records",
        confirm: "Confirm",
      },
    },
  }),
}));
vi.mock("./hooks/useProjectActions", () => ({
  useProjectActions: () => ({
    projects: [{ id: "project-1", name: "Project" }],
    activeProject: { id: "project-1", name: "Project", folderName: "Project" },
    handleSelect: mocks.handleSelect,
    projectSwitchState: { open: false },
    confirmProjectSwitch: vi.fn(),
    cancelProjectSwitch: vi.fn(),
    handleRename: mocks.handleRename,
    handleRemove: mocks.handleRemove,
    handleAdd: mocks.handleAdd,
    handleChangeSyncId: mocks.handleChangeSyncId,
    syncIdEditorState: { open: false },
    updateSyncIdEditorValue: vi.fn(),
    confirmSyncIdEditor: vi.fn(),
    cancelSyncIdEditor: vi.fn(),
    restoreProjectMetadata: vi.fn(),
    ensureProjectSyncId: vi.fn(),
  }),
}));
vi.mock("./hooks/useBackupActions", () => ({
  useBackupActions: () => ({
    importZipRef: { current: null },
    handleExportZip: mocks.handleExportZip,
    isExportingZip: false,
    handleImportZip: mocks.handleImportZip,
    importConfirmState: { open: false },
    confirmImport: vi.fn(),
    cancelImport: vi.fn(),
    conflictState: { open: false },
    setConflictState: vi.fn(),
    handleConflictOverwrite: vi.fn(),
    handleConflictMerge: vi.fn(),
    handleConflictCopy: vi.fn(),
  }),
}));
vi.mock("./hooks/useLocalSync", () => ({
  useLocalSync: () => ({ ready: true }),
}));
vi.mock("./settingsCleanup", () => ({
  performSettingsCleanup: vi.fn(
    async (action, { clearMapCache, clearDatabase }) => {
      if (action === "clearMapCache") await clearMapCache();
      if (action === "clearDatabase") await clearDatabase();
      return action;
    },
  ),
}));

vi.mock("@/components/layout/PageHeader/PageHeader", () => ({
  default: ({ title, onBack }) => <button onClick={onBack}>{title}</button>,
}));
vi.mock("@/components/ui/Notification/Notification", () => ({
  default: ({ notification, onClose }) =>
    notification ? (
      <button onClick={onClose}>notice:{notification.message}</button>
    ) : null,
}));
vi.mock("./components/AddProjectForm", () => ({
  default: ({ onConfirm, onCancel }) => (
    <div>
      <button onClick={() => onConfirm("New", "upstream")}>confirm-add</button>
      <button onClick={onCancel}>cancel-add</button>
    </div>
  ),
}));
vi.mock("./components/ProjectList", () => ({
  default: ({ onSelect, onRename, onRemove, onChangeSyncId }) => (
    <div>
      <button onClick={() => onSelect("project-1")}>select-project</button>
      <button onClick={() => onRename("project-1", "Renamed")}>
        rename-project
      </button>
      <button onClick={() => onRemove("project-1")}>remove-project</button>
      <button onClick={() => onChangeSyncId("project-1")}>sync-id</button>
    </div>
  ),
}));
vi.mock("./components/AppearanceSection", () => ({
  default: ({ onToggleLanguage }) => (
    <button onClick={onToggleLanguage}>appearance</button>
  ),
}));
vi.mock("./components/EmissionsSummarySection", () => ({
  default: () => <div>emissions</div>,
}));
vi.mock("./components/FieldVisibilitySection", () => ({
  default: ({ onConfigure, onExportModeChange }) => (
    <div>
      <button onClick={onConfigure}>configure-fields</button>
      <button onClick={() => onExportModeChange("latest")}>export-mode</button>
    </div>
  ),
}));
vi.mock("./components/PhotoRequirementsSection", () => ({
  default: ({ onLeakPhotoRequiredChange, onMonitoringPhotoRequiredChange }) => (
    <div>
      <button onClick={() => onLeakPhotoRequiredChange(true)}>
        require-leak-photo
      </button>
      <button onClick={() => onMonitoringPhotoRequiredChange(true)}>
        require-monitor-photo
      </button>
    </div>
  ),
}));
vi.mock("./components/BackupSection", () => ({
  default: ({ onExport, onImport }) => (
    <div>
      <button onClick={onExport}>export-backup</button>
      <button onClick={onImport}>import-backup</button>
    </div>
  ),
}));
vi.mock("./components/LocalSyncSection", () => ({
  default: () => <div>local-sync</div>,
}));
vi.mock("./components/ProjectIntegritySection", () => ({
  default: ({ onCheck }) => <button onClick={onCheck}>integrity</button>,
}));
vi.mock("./components/MapCacheSection", () => ({
  default: ({ cacheInfo, onClear }) => (
    <button onClick={onClear}>cache:{cacheInfo?.count ?? "loading"}</button>
  ),
}));
vi.mock("./components/DangerZoneSection", () => ({
  default: ({ onClearDatabase }) => (
    <button onClick={onClearDatabase}>danger-clear</button>
  ),
}));
vi.mock(
  "@/features/fieldVisibility/FieldVisibilityModal/FieldVisibilityModal",
  () => ({
    default: ({ open, onSave, onClose }) =>
      open ? (
        <div>
          <button onClick={() => onSave(new Set(["pressure"]))}>
            save-fields
          </button>
          <button onClick={onClose}>close-fields</button>
        </div>
      ) : null,
  }),
);
vi.mock("@/features/importConflict/ImportConflictSheet", () => ({
  default: () => null,
}));
vi.mock("./components/SyncIdEditorSheet", () => ({ default: () => null }));
vi.mock("@/components/ui/ConfirmSheet/ConfirmSheet", () => ({
  default: ({ open, title, onConfirm, onCancel }) =>
    open ? (
      <div>
        <button onClick={onConfirm}>confirm:{title}</button>
        <button onClick={onCancel}>cancel:{title}</button>
      </div>
    ) : null,
}));

import Settings from "./Settings";

describe("Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMapCacheInfo.mockResolvedValue({ count: 12, sizeMB: 1 });
    mocks.clearMapCache.mockResolvedValue(undefined);
  });

  it("wires project, visibility, photo, backup, and cleanup settings", async () => {
    const onBack = vi.fn();
    render(
      <Settings
        onBack={onBack}
        data={[{ id: "leak-1" }]}
        setData={vi.fn()}
        clearDatabase={mocks.clearDatabase}
      />,
    );

    await waitFor(() => expect(screen.getByText("cache:12")).toBeTruthy());
    for (const label of [
      "Settings",
      "select-project",
      "rename-project",
      "remove-project",
      "sync-id",
      "appearance",
      "export-mode",
      "require-leak-photo",
      "require-monitor-photo",
      "export-backup",
      "import-backup",
    ])
      fireEvent.click(screen.getByText(label));

    fireEvent.click(screen.getByText("+ Add project"));
    fireEvent.click(screen.getByText("confirm-add"));
    fireEvent.click(screen.getByText("configure-fields"));
    fireEvent.click(screen.getByText("save-fields"));
    fireEvent.click(screen.getByText("cache:12"));
    fireEvent.click(screen.getByText("confirm:Clear map cache"));
    await waitFor(() =>
      expect(screen.getByText("notice:Cache cleared")).toBeTruthy(),
    );
    fireEvent.click(screen.getByText("danger-clear"));
    fireEvent.click(screen.getByText("confirm:Clear database"));
    await waitFor(() =>
      expect(screen.getByText("notice:Database cleared")).toBeTruthy(),
    );

    expect(onBack).toHaveBeenCalled();
    expect(mocks.handleAdd).toHaveBeenCalledWith("New", "upstream");
    expect(mocks.setHiddenFields).toHaveBeenCalled();
    expect(mocks.setMonitoringExportMode).toHaveBeenCalledWith("latest");
    expect(mocks.setLeakPhotoRequired).toHaveBeenCalledWith(true);
    expect(mocks.setMonitoringPhotoRequired).toHaveBeenCalledWith(true);
    expect(mocks.handleExportZip).toHaveBeenCalled();
    expect(mocks.handleImportZip).toHaveBeenCalled();
  });
});
