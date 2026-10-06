import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projects: [],
  activeProject: null,
  getMapCacheInfo: vi.fn(),
  clearMapCache: vi.fn(),
  clearDatabase: vi.fn(),
  setVars: vi.fn(),
  setHiddenFields: vi.fn(),
  setMonitoringExportMode: vi.fn(),
  setLeakPhotoRequired: vi.fn(),
  setMonitoringPhotoRequired: vi.fn(),
  setComponentPhotoRequired: vi.fn(),
  handleAdd: vi.fn(),
  handleSelect: vi.fn(),
  handleRename: vi.fn(),
  handleRemove: vi.fn(),
  handleChangeSyncId: vi.fn(),
  handleImportZip: vi.fn(),
  detectImportKind: vi.fn(),
}));

vi.mock("@/services/maps/tileCache", () => ({
  getMapCacheInfo: mocks.getMapCacheInfo,
  clearMapCache: mocks.clearMapCache,
}));
vi.mock("@/app/project/hooks/useProjectVars", () => ({
  useProjectVars: () => ({ vars: {}, setVarsAsync: mocks.setVars }),
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
    componentPhotoRequired: true,
    setLeakPhotoRequired: mocks.setLeakPhotoRequired,
    setMonitoringPhotoRequired: mocks.setMonitoringPhotoRequired,
    setComponentPhotoRequired: mocks.setComponentPhotoRequired,
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
    projects: mocks.projects,
    activeProject: mocks.activeProject,
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
vi.mock("./components/ActiveProjectCard", () => ({
  default: ({ onRename, onChangeSyncId }) => (
    <div>
      <button onClick={() => onRename("Renamed")}>rename-project</button>
      <button onClick={onChangeSyncId}>sync-id</button>
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
  default: ({ onConfigure }) => (
    <div>
      <button onClick={onConfigure}>configure-fields</button>
    </div>
  ),
}));
vi.mock("./components/PhotoRequirementsSection", () => ({
  default: ({
    onLeakPhotoRequiredChange,
    onMonitoringPhotoRequiredChange,
    onComponentPhotoRequiredChange,
    hasComponentRegistry,
  }) => (
    <div>
      <span>registry:{String(hasComponentRegistry)}</span>
      <button onClick={() => onLeakPhotoRequiredChange(true)}>
        require-leak-photo
      </button>
      <button onClick={() => onMonitoringPhotoRequiredChange(true)}>
        require-monitor-photo
      </button>
      <button onClick={() => onComponentPhotoRequiredChange(true)}>
        require-component-photo
      </button>
    </div>
  ),
}));
// Оба набора диалогов подменены сквозными кнопками: их собственная разметка
// проверяется в ImportExportDialogs.test.jsx, здесь важна только разводка.
vi.mock("./components/ImportExportDialogs", () => ({
  default: ({ backupConflict, excelConflict, excelImport, importConfirm }) => (
    <div>
      <button onClick={backupConflict.onCancel}>cancel-backup-conflict</button>
      <button onClick={excelConflict.onCancel}>cancel-excel-conflict</button>
      <button onClick={excelImport.onCancel}>cancel-excel-import</button>
      <button onClick={importConfirm.onCancel}>cancel-import-confirm</button>
    </div>
  ),
}));
vi.mock("./components/ProjectManagementDialogs", () => ({
  default: ({ switchState, syncIdEditor }) => (
    <div>
      <button onClick={switchState.onCancel}>cancel-switch</button>
      <button onClick={syncIdEditor.onCancel}>cancel-sync-id</button>
    </div>
  ),
}));
// Одна кнопка импорта: экран импорта отдаёт файл, а страница сама решает,
// что это. ZIP-бэкап выгружается из меню, в настройках его больше нет.
vi.mock("./components/ImportSection", () => ({
  default: ({ onImport }) => (
    <div>
      <button
        onClick={() =>
          onImport({
            target: { files: [new File([""], "backup.zip")], value: "" },
          })
        }
      >
        import-backup
      </button>
    </div>
  ),
}));
vi.mock("@/services/import/importRouting", () => ({
  detectImportKind: mocks.detectImportKind,
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
  default: ({ onClearDatabase, onRemoveProject }) => (
    <div>
      <button onClick={onClearDatabase}>danger-clear</button>
      <button onClick={onRemoveProject}>danger-remove</button>
    </div>
  ),
}));
vi.mock("@/features/fieldVisibility/FieldVisibilityModal", () => ({
  default: ({ open, onSave, onClose }) =>
    open ? (
      <div>
        <button onClick={() => onSave(new Set(["pressure"]))}>
          save-fields
        </button>
        <button onClick={() => onSave(new Set())}>clear-fields</button>
        <button onClick={onClose}>close-fields</button>
      </div>
    ) : null,
}));
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
    mocks.projects = [{ id: "project-1", name: "Project" }];
    mocks.activeProject = {
      id: "project-1",
      name: "Project",
      folderName: "Project",
      type: "upstream",
    };
    mocks.getMapCacheInfo.mockResolvedValue({ count: 12, sizeMB: 1 });
    mocks.clearMapCache.mockResolvedValue(undefined);
    mocks.detectImportKind.mockResolvedValue({ kind: "project" });
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
      "rename-project",
      "sync-id",
      "appearance",
      "require-leak-photo",
      "require-monitor-photo",
    ])
      fireEvent.click(screen.getByText(label));

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

    // Удаление проекта — в опасной зоне и только после подтверждения.
    fireEvent.click(screen.getByText("danger-remove"));
    expect(mocks.handleRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("confirm:settings.deleteProjectTitle:"));

    expect(onBack).toHaveBeenCalled();
    expect(mocks.handleRename).toHaveBeenCalledWith("project-1", "Renamed");
    expect(mocks.handleRemove).toHaveBeenCalledWith("project-1");
    expect(mocks.setHiddenFields).toHaveBeenCalled();
    expect(mocks.setLeakPhotoRequired).toHaveBeenCalledWith(true);
    expect(mocks.setMonitoringPhotoRequired).toHaveBeenCalledWith(true);
  });

  it("routes an imported ZIP backup from the import screen", async () => {
    render(
      <Settings
        view="import"
        data={[]}
        setData={vi.fn()}
        clearDatabase={mocks.clearDatabase}
      />,
    );
    fireEvent.click(screen.getByText("import-backup"));
    // Файл распознан как ZIP-бэкап и ушёл тому же обработчику, что и раньше.
    await waitFor(() => expect(mocks.handleImportZip).toHaveBeenCalled());
  });
  it("uses setPage to leave when no explicit back handler is given", () => {
    const setPage = vi.fn();
    render(
      <Settings
        setPage={setPage}
        data={[]}
        setData={vi.fn()}
        clearDatabase={mocks.clearDatabase}
      />,
    );

    fireEvent.click(screen.getByText("Settings"));

    expect(setPage).toHaveBeenCalledWith("");
  });

  it("offers the registry photo switch and saves it", async () => {
    render(
      <Settings
        data={[]}
        setData={vi.fn()}
        clearDatabase={mocks.clearDatabase}
      />,
    );

    expect(screen.getByText("registry:true")).toBeTruthy();
    fireEvent.click(screen.getByText("require-component-photo"));

    expect(mocks.setComponentPhotoRequired).toHaveBeenCalledWith(true);
    await waitFor(() =>
      expect(
        screen.getByText("notice:settings.componentPhotoRequirementSaved:"),
      ).toBeTruthy(),
    );
  });

  it("hides the registry photo switch for a project without a registry", () => {
    mocks.activeProject = { ...mocks.activeProject, type: "unknown" };
    render(
      <Settings
        data={[]}
        setData={vi.fn()}
        clearDatabase={mocks.clearDatabase}
      />,
    );

    expect(screen.getByText("registry:false")).toBeTruthy();
  });

  it("shows only the active project, with no list or add form", () => {
    render(
      <Settings
        data={[]}
        setData={vi.fn()}
        clearDatabase={mocks.clearDatabase}
      />,
    );

    // Проекты добавляют из меню, в окне поверх него — здесь формы нет.
    expect(screen.getByText("rename-project")).toBeTruthy();
    expect(screen.queryByText("confirm-add")).toBeNull();
  });

  it("says there is no project yet", () => {
    mocks.activeProject = null;
    render(
      <Settings
        data={[]}
        setData={vi.fn()}
        clearDatabase={mocks.clearDatabase}
      />,
    );

    expect(screen.getByText("No projects")).toBeTruthy();
  });

  it("dismisses a notification", async () => {
    render(
      <Settings
        data={[]}
        setData={vi.fn()}
        clearDatabase={mocks.clearDatabase}
      />,
    );

    await waitFor(() => expect(screen.getByText("cache:12")).toBeTruthy());
    fireEvent.click(screen.getByText("cache:12"));
    fireEvent.click(screen.getByText("confirm:Clear map cache"));
    await waitFor(() =>
      expect(screen.getByText("notice:Cache cleared")).toBeTruthy(),
    );

    fireEvent.click(screen.getByText("notice:Cache cleared"));
    expect(screen.queryByText(/^notice:/)).toBeNull();
  });

  it("reports when every field is back on", async () => {
    render(
      <Settings
        data={[]}
        setData={vi.fn()}
        clearDatabase={mocks.clearDatabase}
      />,
    );

    fireEvent.click(screen.getByText("configure-fields"));
    fireEvent.click(screen.getByText("clear-fields"));

    expect(mocks.setHiddenFields).toHaveBeenCalledWith(new Set());
    await waitFor(() =>
      expect(screen.getByText("notice:All fields active")).toBeTruthy(),
    );
  });

  it("closes the field modal without saving", () => {
    render(
      <Settings
        data={[]}
        setData={vi.fn()}
        clearDatabase={mocks.clearDatabase}
      />,
    );

    fireEvent.click(screen.getByText("configure-fields"));
    fireEvent.click(screen.getByText("close-fields"));

    expect(screen.queryByText("close-fields")).toBeNull();
    expect(mocks.setHiddenFields).not.toHaveBeenCalled();
  });

  it("keeps the field modal out of reach with no project open", () => {
    mocks.activeProject = null;
    render(
      <Settings
        data={[]}
        setData={vi.fn()}
        clearDatabase={mocks.clearDatabase}
      />,
    );

    fireEvent.click(screen.getByText("configure-fields"));

    expect(screen.queryByText("close-fields")).toBeNull();
  });

  it("closes every import and project dialog on cancel", async () => {
    render(
      <Settings
        data={[]}
        setData={vi.fn()}
        clearDatabase={mocks.clearDatabase}
      />,
    );
    await waitFor(() => expect(screen.getByText("cache:12")).toBeTruthy());

    for (const label of [
      "cancel-backup-conflict",
      "cancel-excel-conflict",
      "cancel-excel-import",
      "cancel-import-confirm",
      "cancel-switch",
      "cancel-sync-id",
    ])
      fireEvent.click(screen.getByText(label));

    // Отказ от подтверждения очистки закрывает лист, ничего не тронув.
    fireEvent.click(screen.getByText("cache:12"));
    fireEvent.click(screen.getByText("cancel:Clear map cache"));

    expect(screen.queryByText("cancel:Clear map cache")).toBeNull();
    expect(mocks.clearMapCache).not.toHaveBeenCalled();
  });
});
