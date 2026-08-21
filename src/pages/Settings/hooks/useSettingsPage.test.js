import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/test/translate";
import { useSettingsPage } from "./useSettingsPage";

const mocks = vi.hoisted(() => ({
  activeProject: { id: "project-1", name: "Alpha", type: "upstream" },
  projects: [{ id: "project-1", name: "Alpha", type: "upstream" }],
  getMapCacheInfo: vi.fn(),
  clearMapCache: vi.fn(),
  readImportOperation: vi.fn(),
  performSettingsCleanup: vi.fn(),
  parseExcelImportFile: vi.fn(),
  reconcileExcelImportPhotos: vi.fn(),
  persistExcelImportPhotos: vi.fn(),
  previewMergeLeaks: vi.fn(),
  mergeLeaksByFreshness: vi.fn(),
  runExcelImportTransaction: vi.fn(),
  getExcelImportTransactionWarning: vi.fn(),
  resolvePortableExcelArchiveRoute: vi.fn(),
  analyzeProjectIntegrity: vi.fn(),
  setVarsAsync: vi.fn(),
  restoreProjectMetadata: vi.fn(),
  restoreProjectSnapshot: vi.fn(),
  writeProjectSettings: vi.fn(),
  readProjectSettings: vi.fn(),
  readMonitoringRound: vi.fn(),
  saveMonitoringRound: vi.fn(),
  readProjectSyncStateAsync: vi.fn(),
  writeProjectSyncState: vi.fn(),
  savePhoto: vi.fn(),
  deletePhoto: vi.fn(),
  getPhoto: vi.fn(),
  detectImportKind: vi.fn(),
  importInventoryFile: vi.fn(),
  loadComponentRegistry: vi.fn(),
  hasComponentRegistry: vi.fn(),
  componentRegistryProjectTypes: vi.fn(),
}));

vi.mock("@/services/maps/tileCache", () => ({
  getMapCacheInfo: mocks.getMapCacheInfo,
  clearMapCache: mocks.clearMapCache,
}));
vi.mock("@/services/import/importOperationJournal", () => ({
  readImportOperation: mocks.readImportOperation,
}));
vi.mock("../settingsCleanup", () => ({
  performSettingsCleanup: mocks.performSettingsCleanup,
}));
vi.mock("../excelArchiveRouting", () => ({
  resolvePortableExcelArchiveRoute: mocks.resolvePortableExcelArchiveRoute,
}));
vi.mock("@/services/import/excelImportService", () => ({
  parseExcelImportFile: mocks.parseExcelImportFile,
  reconcileExcelImportPhotos: mocks.reconcileExcelImportPhotos,
  persistExcelImportPhotos: mocks.persistExcelImportPhotos,
}));
vi.mock("@/services/backup/projectBackupService", () => ({
  previewMergeLeaks: mocks.previewMergeLeaks,
  mergeLeaksByFreshness: mocks.mergeLeaksByFreshness,
}));
vi.mock("@/services/backup/projectIntegrityService", () => ({
  analyzeProjectIntegrity: mocks.analyzeProjectIntegrity,
}));
vi.mock("@/services/import/excelImportTransaction", () => ({
  runExcelImportTransaction: mocks.runExcelImportTransaction,
  getExcelImportTransactionWarning: mocks.getExcelImportTransactionWarning,
}));
vi.mock("@/utils/monitoringRound", () => ({
  readMonitoringRound: mocks.readMonitoringRound,
  saveMonitoringRound: mocks.saveMonitoringRound,
}));
vi.mock("@/app/project/projectSettings", () => ({
  readProjectSettings: mocks.readProjectSettings,
  writeProjectSettings: mocks.writeProjectSettings,
}));
vi.mock("@/services/sync/projectSyncState", () => ({
  readProjectSyncStateAsync: mocks.readProjectSyncStateAsync,
  writeProjectSyncState: mocks.writeProjectSyncState,
}));
vi.mock("@/app/project/storageKeys", () => ({
  STORAGE_KEYS: { PROJECT_VARS: (id) => `vars:${id}` },
}));
vi.mock("@/app/project/hooks/useProjectVars", () => ({
  useProjectVars: () => ({
    vars: { density: 0.7 },
    setVarsAsync: mocks.setVarsAsync,
  }),
}));
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({
    getPhoto: mocks.getPhoto,
    savePhoto: mocks.savePhoto,
    deletePhoto: mocks.deletePhoto,
  }),
}));
vi.mock("@/app/project/hooks/useProjectConfig", () => ({
  useProjectConfig: () => ({ fields: [] }),
}));
vi.mock("@/app/project/hooks/useHiddenFields", () => ({
  useHiddenFields: () => ({ hiddenFields: [], setHiddenFields: vi.fn() }),
}));
vi.mock("@/app/project/hooks/useExcelExportMode", () => ({
  useExcelExportMode: () => ({
    monitoringExportMode: "all",
    setMonitoringExportMode: vi.fn(),
  }),
}));
vi.mock("@/app/project/hooks/usePhotoRequirements", () => ({
  usePhotoRequirements: () => ({
    leakPhotoRequired: false,
    monitoringPhotoRequired: false,
    setLeakPhotoRequired: vi.fn(),
    setMonitoringPhotoRequired: vi.fn(),
  }),
}));
vi.mock("./useSettingsTexts", () => ({
  useSettingsTexts: () => ({
    lang: "en",
    t: translate,
    toggleLanguage: vi.fn(),
    localeTexts: {
      clearMapCache: "Очистить карту",
      clearDatabase: "Очистить базу",
      dialogs: {
        clearMapCache: "Удалить кэш карты?",
        clearDatabase: "Удалить базу?",
      },
      notifications: {
        cacheCleared: "Кэш очищен",
        databaseCleared: "База очищена",
      },
    },
  }),
}));
vi.mock("./useProjectActions", () => ({
  useProjectActions: () => ({
    projects: mocks.projects,
    activeProject: mocks.activeProject,
    handleSelect: vi.fn(),
    projectSwitchState: null,
    confirmProjectSwitch: vi.fn(),
    cancelProjectSwitch: vi.fn(),
    handleRename: vi.fn(),
    handleRemove: vi.fn(),
    handleAdd: vi.fn(),
    handleChangeSyncId: vi.fn(),
    syncIdEditorState: null,
    updateSyncIdEditorValue: vi.fn(),
    confirmSyncIdEditor: vi.fn(),
    cancelSyncIdEditor: vi.fn(),
    restoreProjectMetadata: mocks.restoreProjectMetadata,
    restoreProjectSnapshot: mocks.restoreProjectSnapshot,
    ensureProjectSyncId: vi.fn(),
  }),
}));
const backupActions = vi.hoisted(() => ({ options: null }));
vi.mock("./useBackupActions", () => ({
  useBackupActions: (options) => ({
    ...(() => {
      backupActions.options = options;
      return {};
    })(),
    importZipRef: { current: null },
    handleExportZip: vi.fn(),
    isExportingZip: false,
    handleImportZip: vi.fn(),
    importConfirmState: null,
    confirmImport: vi.fn(),
    cancelImport: vi.fn(),
    conflictState: null,
    setConflictState: vi.fn(),
    handleConflictOverwrite: vi.fn(),
    handleConflictMerge: vi.fn(),
    handleConflictCopy: vi.fn(),
  }),
}));
vi.mock("./useLocalSync", () => ({
  useLocalSync: () => ({ state: "idle" }),
}));
vi.mock("@/services/import/importRouting", () => ({
  detectImportKind: mocks.detectImportKind,
}));
vi.mock("@/services/inventory/inventoryImport", () => ({
  importInventoryFile: mocks.importInventoryFile,
}));
vi.mock("@/configs/projectAdapter", () => ({
  loadComponentRegistry: mocks.loadComponentRegistry,
  hasComponentRegistry: mocks.hasComponentRegistry,
  componentRegistryProjectTypes: mocks.componentRegistryProjectTypes,
}));

function excelResult(overrides = {}) {
  return {
    leaks: [{ id: "incoming", leak_id: "TAG-2" }],
    stats: { restoredPhotos: 0 },
    portableArchive: false,
    project: { name: "Imported", type: "upstream", syncId: "sync-imported-1" },
    ...overrides,
  };
}

function fileEvent(file = new File(["data"], "leaks.xlsx")) {
  return { target: { files: file ? [file] : [], value: "selected" } };
}

function renderSettings(props = {}) {
  const defaults = {
    data: [],
    setData: vi.fn(),
    clearDatabase: vi.fn(),
    onImportZip: vi.fn(),
    onImportIntoExisting: vi.fn(),
    onCreateExcelCopy: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  return { ...renderHook(() => useSettingsPage(merged)), props: merged };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.activeProject = { id: "project-1", name: "Alpha", type: "upstream" };
  mocks.projects = [{ id: "project-1", name: "Alpha", type: "upstream" }];
  mocks.getMapCacheInfo.mockResolvedValue({ count: 3, sizeMB: 1.5 });
  mocks.readImportOperation.mockReturnValue(null);
  mocks.resolvePortableExcelArchiveRoute.mockReturnValue({ action: "current" });
  mocks.reconcileExcelImportPhotos.mockImplementation(
    async (_current, leaks) => ({
      leaks,
      photos: { restored: 0 },
    }),
  );
  mocks.persistExcelImportPhotos.mockImplementation(async (leaks) => ({
    leaks,
    createdPaths: [],
  }));
  mocks.runExcelImportTransaction.mockImplementation(
    async ({ persistPhotos, commit }) => {
      const transaction = await persistPhotos();
      const leaks = transaction?.leaks ?? transaction;
      await commit(leaks);
      return leaks;
    },
  );
  mocks.getExcelImportTransactionWarning.mockReturnValue("");
  mocks.restoreProjectSnapshot.mockReturnValue(true);
  mocks.readProjectSettings.mockReturnValue({ hiddenFields: [] });
  mocks.readMonitoringRound.mockReturnValue(null);
  mocks.readProjectSyncStateAsync.mockResolvedValue({ deleted: {} });
  mocks.previewMergeLeaks.mockReturnValue({ changed: 1 });
  mocks.detectImportKind.mockResolvedValue({ kind: "project" });
  mocks.loadComponentRegistry.mockResolvedValue({ groups: [] });
  mocks.hasComponentRegistry.mockReturnValue(true);
  mocks.componentRegistryProjectTypes.mockReturnValue(["upstream"]);
  mocks.importInventoryFile.mockResolvedValue({
    added: 2,
    updated: 1,
    conflicts: 0,
    shadowed: 0,
  });
  mocks.mergeLeaksByFreshness.mockReturnValue({
    leaks: [{ id: "merged", leak_id: "TAG-2" }],
    changed: 1,
  });
});

describe("useSettingsPage orchestration", () => {
  it("loads cache info and surfaces an interrupted import", async () => {
    mocks.readImportOperation.mockReturnValue({ stage: "commit" });
    const { result } = renderSettings();

    await waitFor(() =>
      expect(result.current.cacheInfo).toEqual({ count: 3, sizeMB: 1.5 }),
    );
    expect(result.current.notification).toMatchObject({
      type: "error",
      autoCloseMs: 0,
    });
  });

  it("takes the notification down when the backup flow asks it to", async () => {
    // Сообщение «идёт чтение» висело поверх диалога импорта — вопроса, на
    // который человек в этот момент отвечает. Снятие уходит вниз, в действия
    // с резервными копиями, и вызывают его оттуда.
    mocks.readImportOperation.mockReturnValue({ stage: "commit" });
    const { result } = renderSettings();

    await waitFor(() => expect(result.current.notification).not.toBe(null));
    expect(typeof backupActions.options.dismissNotification).toBe("function");

    await act(async () => backupActions.options.dismissNotification());

    expect(result.current.notification).toBe(null);
  });

  it("handles map and database cleanup confirmations", async () => {
    mocks.performSettingsCleanup.mockResolvedValueOnce("clearMapCache");
    const { result } = renderSettings();

    act(() => result.current.handleClearMapCache());
    expect(result.current.settingsConfirmTexts?.title).toBe("Очистить карту");
    await act(async () => result.current.handleSettingsConfirm());
    expect(result.current.cacheInfo).toEqual({ count: 0, sizeMB: 0 });
    expect(result.current.notification).toMatchObject({
      type: "success",
      message: "Кэш очищен",
    });

    mocks.performSettingsCleanup.mockResolvedValueOnce("clearDatabase");
    act(() => result.current.handleClearDatabase());
    expect(result.current.settingsConfirmTexts?.title).toBe("Очистить базу");
    await act(async () => result.current.handleSettingsConfirm());
    expect(result.current.notification).toMatchObject({
      type: "warning",
      message: "База очищена",
    });
  });

  it("reports cleanup and integrity failures without leaving busy state", async () => {
    mocks.performSettingsCleanup.mockRejectedValueOnce(
      new Error("cleanup failed"),
    );
    mocks.analyzeProjectIntegrity.mockRejectedValueOnce(new Error("broken"));
    const { result } = renderSettings();

    act(() => result.current.handleClearMapCache());
    await act(async () => result.current.handleSettingsConfirm());
    expect(result.current.notification.message).toContain("cleanup failed");

    await act(async () => result.current.handleCheckIntegrity());
    expect(result.current.checkingIntegrity).toBe(false);
    expect(result.current.notification.message).toContain("broken");
  });

  it("checks project integrity successfully", async () => {
    mocks.analyzeProjectIntegrity.mockResolvedValueOnce({
      ok: false,
      issues: 2,
    });
    const { result } = renderSettings({ data: [{ id: 1 }] });

    await act(async () => result.current.handleCheckIntegrity());

    expect(result.current.integrityReport).toEqual({ ok: false, issues: 2 });
    expect(result.current.notification).toMatchObject({ type: "warning" });
  });

  it("parses an Excel file and confirms a transactional import", async () => {
    const parsed = excelResult();
    mocks.parseExcelImportFile.mockResolvedValueOnce(parsed);
    const { result, props } = renderSettings();
    const event = fileEvent();

    await act(async () => result.current.handleImportExcel(event));
    expect(event.target.value).toBe("");
    expect(result.current.excelImportState).toMatchObject({
      open: true,
      fileName: "leaks.xlsx",
    });

    await act(async () => result.current.confirmExcelImport());

    expect(mocks.runExcelImportTransaction).toHaveBeenCalledTimes(1);
    expect(props.setData).toHaveBeenCalledWith([
      expect.objectContaining({ leak_id: "TAG-2", importedFromExcel: true }),
    ]);
    expect(result.current.excelImportState).toEqual({ open: false });
    expect(result.current.notification).toMatchObject({ type: "success" });
  });

  it("does not open confirmation for an empty workbook", async () => {
    mocks.parseExcelImportFile.mockResolvedValueOnce(
      excelResult({ leaks: [] }),
    );
    const { result } = renderSettings();

    await act(async () => result.current.handleImportExcel(fileEvent()));

    expect(result.current.excelImportState).toEqual({ open: false });
    expect(result.current.notification).toMatchObject({ type: "warning" });
  });

  it("creates a project directly for a routed portable archive", async () => {
    const parsed = excelResult({ portableArchive: true });
    mocks.parseExcelImportFile.mockResolvedValueOnce(parsed);
    mocks.resolvePortableExcelArchiveRoute.mockReturnValueOnce({
      action: "create",
      name: "Imported archive",
    });
    const onCreateExcelCopy = vi.fn().mockResolvedValue({
      project: { name: "Imported archive" },
    });
    const { result } = renderSettings({ onCreateExcelCopy });

    await act(async () => result.current.handleImportExcel(fileEvent()));

    expect(onCreateExcelCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Imported archive",
        leaks: parsed.leaks,
      }),
    );
    expect(result.current.notification).toMatchObject({ type: "success" });
  });

  it("opens conflict preview and performs overwrite, merge, and copy", async () => {
    const parsed = excelResult();
    mocks.parseExcelImportFile.mockResolvedValue(parsed);
    const data = [{ id: "old", leak_id: "TAG-1", index: 1 }];
    const onCreateExcelCopy = vi
      .fn()
      .mockResolvedValue({ project: { name: "Alpha (Excel)" } });
    const { result, props } = renderSettings({ data, onCreateExcelCopy });

    await act(async () => result.current.handleImportExcel(fileEvent()));
    expect(result.current.excelConflictState).toMatchObject({
      open: true,
      leakCount: 1,
    });

    await act(async () => result.current.handleExcelConflictOverwrite());
    expect(props.setData).toHaveBeenCalledWith([
      expect.objectContaining({ leak_id: "TAG-2", index: 1 }),
    ]);

    act(() =>
      result.current.setExcelConflictState({
        open: true,
        result: parsed,
        preparedForMerge: parsed.leaks,
      }),
    );
    await act(async () => result.current.handleExcelConflictMerge());
    expect(mocks.mergeLeaksByFreshness).toHaveBeenCalled();
    expect(props.setData).toHaveBeenCalledWith([
      { id: "merged", leak_id: "TAG-2" },
    ]);

    act(() =>
      result.current.setExcelConflictState({ open: true, result: parsed }),
    );
    await act(async () => result.current.handleExcelConflictCopy());
    expect(onCreateExcelCopy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Imported (Excel)", type: "upstream" }),
    );
  });

  it("reports parse and transactional errors and closes dialogs", async () => {
    mocks.parseExcelImportFile.mockRejectedValueOnce(new Error("bad workbook"));
    const { result } = renderSettings();

    await act(async () => result.current.handleImportExcel(fileEvent()));
    expect(result.current.notification.message).toContain("bad workbook");
    expect(result.current.isImportingExcel).toBe(false);

    act(() =>
      result.current.setExcelConflictState({
        open: true,
        result: excelResult(),
      }),
    );
    mocks.runExcelImportTransaction.mockRejectedValueOnce(
      Object.assign(new Error("save failed"), {
        rollbackError: new Error("rollback failed"),
        photoRollbackErrors: [new Error("photo")],
      }),
    );
    await act(async () => result.current.handleExcelConflictOverwrite());
    expect(result.current.notification.message).toContain("save failed");
    expect(result.current.notification.message).toContain("rollback failed");
    expect(result.current.excelConflictState).toEqual({ open: false });
  });

  it("cancels an Excel confirmation and ignores missing files", async () => {
    const { result } = renderSettings();
    await act(async () => result.current.handleImportExcel(fileEvent(null)));
    expect(mocks.parseExcelImportFile).not.toHaveBeenCalled();

    act(() => result.current.setExcelConflictState({ open: true }));
    act(() => result.current.cancelExcelImport());
    expect(result.current.excelImportState).toEqual({ open: false });
  });

  it("falls back to an empty cache summary when cache inspection fails", async () => {
    mocks.getMapCacheInfo.mockRejectedValueOnce(new Error("cache unavailable"));

    const { result } = renderSettings();

    await waitFor(() =>
      expect(result.current.cacheInfo).toEqual({ count: 0, sizeMB: 0 }),
    );
  });

  it("applies portable archive metadata during a confirmed import", async () => {
    const parsed = excelResult({
      portableArchive: true,
      vars: { density: 0.9 },
      settings: { hiddenFields: ["pressure"] },
      monitoringRound: { id: "round-2" },
      sync: { deleted: { "TAG-1": 10 } },
    });
    mocks.parseExcelImportFile.mockResolvedValueOnce(parsed);
    const { result, props } = renderSettings();

    await act(async () => result.current.handleImportExcel(fileEvent()));
    await act(async () => result.current.confirmExcelImport());

    expect(mocks.restoreProjectMetadata).toHaveBeenCalledWith(
      "project-1",
      parsed.project,
    );
    expect(mocks.setVarsAsync).toHaveBeenCalledWith(parsed.vars);
    expect(mocks.writeProjectSettings).toHaveBeenCalledWith(
      "project-1",
      parsed.settings,
    );
    expect(mocks.saveMonitoringRound).toHaveBeenCalledWith(
      "project-1",
      parsed.monitoringRound,
    );
    expect(mocks.writeProjectSyncState).toHaveBeenCalledWith(
      "project-1",
      parsed.sync,
      expect.any(Array),
    );
    expect(props.setData).toHaveBeenCalled();
  });

  it("restores the captured project state when an import commit fails", async () => {
    const parsed = excelResult({
      vars: { density: 0.95 },
      settings: { hiddenFields: ["temperature"] },
      sync: { deleted: { stale: 5 } },
    });
    mocks.parseExcelImportFile.mockResolvedValueOnce(parsed);
    localStorage.setItem("vars:project-1", JSON.stringify({ density: 0.7 }));
    mocks.readProjectSettings.mockReturnValueOnce({ hiddenFields: ["old"] });
    mocks.readMonitoringRound.mockReturnValueOnce({ id: "round-old" });
    mocks.readProjectSyncStateAsync.mockResolvedValueOnce({
      deleted: { old: 1 },
    });
    const original = [{ id: "old", leak_id: "TAG-1" }];
    const setData = vi.fn();
    mocks.runExcelImportTransaction.mockImplementationOnce(
      async ({ persistPhotos, commit, rollbackState }) => {
        const transaction = await persistPhotos();
        const leaks = transaction?.leaks ?? transaction;
        try {
          await commit(leaks);
          throw new Error("commit failed");
        } catch (error) {
          await rollbackState();
          throw error;
        }
      },
    );
    const { result } = renderSettings({ data: original, setData });

    await act(async () => result.current.handleImportExcel(fileEvent()));
    await act(async () => result.current.handleExcelConflictOverwrite());

    expect(setData).toHaveBeenLastCalledWith(original);
    expect(mocks.restoreProjectSnapshot).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ id: "project-1", name: "Alpha" }),
    );
    expect(localStorage.getItem("vars:project-1")).toBe(
      JSON.stringify({ density: 0.7 }),
    );
    expect(mocks.writeProjectSettings).toHaveBeenLastCalledWith("project-1", {
      hiddenFields: ["old"],
    });
    expect(mocks.saveMonitoringRound).toHaveBeenLastCalledWith("project-1", {
      id: "round-old",
    });
    expect(mocks.writeProjectSyncState).toHaveBeenLastCalledWith(
      "project-1",
      { deleted: { old: 1 } },
      original,
    );
    expect(result.current.notification.message).toContain("commit failed");
    expect(result.current.isImportingExcel).toBe(false);
  });

  it("shows a warning when the transaction journal cannot be cleared", async () => {
    mocks.parseExcelImportFile.mockResolvedValueOnce(excelResult());
    mocks.getExcelImportTransactionWarning.mockReturnValueOnce(
      "journal cleanup failed",
    );
    const { result } = renderSettings();

    await act(async () => result.current.handleImportExcel(fileEvent()));
    await act(async () => result.current.confirmExcelImport());

    expect(result.current.notification).toMatchObject({ type: "warning" });
    expect(result.current.notification.message).toContain(
      "the operation journal could not be cleared",
    );
  });

  it("closes merge and copy conflicts after failures", async () => {
    const parsed = excelResult();
    const onCreateExcelCopy = vi
      .fn()
      .mockRejectedValueOnce(new Error("copy failed"));
    const { result } = renderSettings({
      data: [{ id: "old", leak_id: "TAG-1" }],
      onCreateExcelCopy,
    });

    act(() =>
      result.current.setExcelConflictState({
        open: true,
        result: parsed,
        preparedForMerge: parsed.leaks,
      }),
    );
    mocks.runExcelImportTransaction.mockRejectedValueOnce(
      new Error("merge failed"),
    );
    await act(async () => result.current.handleExcelConflictMerge());
    expect(result.current.notification.message).toContain("merge failed");
    expect(result.current.excelConflictState).toEqual({ open: false });
    expect(result.current.isImportingExcel).toBe(false);

    act(() =>
      result.current.setExcelConflictState({ open: true, result: parsed }),
    );
    await act(async () => result.current.handleExcelConflictCopy());
    expect(result.current.notification.message).toContain("copy failed");
    expect(result.current.excelConflictState).toEqual({ open: false });
    expect(result.current.isImportingExcel).toBe(false);
  });
  // Один вход для импорта: страница сама разбирает, что за файл ей дали, и
  // раздаёт его прежним обработчикам. Проверяем все четыре исхода.
  describe("import routing", () => {
    function inventoryFile(name = "inventory.zip") {
      return { target: { files: [new File(["data"], name)], value: "chosen" } };
    }

    it("routes an inventory archive into the registry import", async () => {
      mocks.detectImportKind.mockResolvedValue({ kind: "inventory" });
      const { result } = renderSettings();

      await act(async () => result.current.handleImportFile(inventoryFile()));

      expect(mocks.importInventoryFile).toHaveBeenCalledWith(
        expect.any(File),
        mocks.activeProject,
        { groups: [] },
      );
      expect(result.current.notification).toMatchObject({ type: "success" });
      expect(result.current.notification.message).toContain("2 added");
    });

    it("warns when the inventory archive brings nothing new", async () => {
      mocks.detectImportKind.mockResolvedValue({ kind: "inventory" });
      mocks.importInventoryFile.mockResolvedValue({
        added: 0,
        updated: 0,
        conflicts: 0,
      });
      const { result } = renderSettings();

      await act(async () => result.current.handleImportFile(inventoryFile()));

      expect(result.current.notification).toMatchObject({ type: "warning" });
      expect(result.current.notification.message).toBe(
        "No components to import were found in the file.",
      );
    });

    // Карточка, заполненная у железа, важнее строки в таблице — но промолчать
    // о непринятых строках нельзя.
    it("reports rows that lost to cards already on the device", async () => {
      mocks.detectImportKind.mockResolvedValue({ kind: "inventory" });
      mocks.importInventoryFile.mockResolvedValue({
        added: 1,
        updated: 0,
        conflicts: 0,
        shadowed: 3,
      });
      const { result } = renderSettings();

      await act(async () => result.current.handleImportFile(inventoryFile()));

      expect(result.current.notification).toMatchObject({ type: "warning" });
      expect(result.current.notification.message).toContain("3 row(s)");
    });

    it("reports an inventory import failure", async () => {
      mocks.detectImportKind.mockResolvedValue({ kind: "inventory" });
      mocks.importInventoryFile.mockRejectedValue(new Error("broken archive"));
      const { result } = renderSettings();

      await act(async () => result.current.handleImportFile(inventoryFile()));

      expect(result.current.notification).toMatchObject({ type: "error" });
      expect(result.current.notification.message).toContain("broken archive");
    });

    // Кнопка импорта одна на все типы проектов, а реестр ведут не все. Решать
    // тут человеку нечего: тип известен приложению, имя написано на файле —
    // архив заводит себе проект сам.
    it("creates a registry project when the open one keeps no registry", async () => {
      mocks.detectImportKind.mockResolvedValue({ kind: "inventory" });
      mocks.hasComponentRegistry.mockReturnValue(false);
      const onImportInventory = vi.fn().mockResolvedValue({
        project: { id: "project-2", name: "Бузахур", type: "upstream" },
        components: 7,
      });
      const { result } = renderSettings({ onImportInventory });

      await act(async () =>
        result.current.handleImportFile(
          inventoryFile("!Inventorization_Бузахур.zip"),
        ),
      );

      expect(onImportInventory).toHaveBeenCalledWith(expect.any(File), {
        name: "Бузахур",
      });
      // Вливание в открытый проект не запускалось: карточки поехали в новый.
      expect(mocks.importInventoryFile).not.toHaveBeenCalled();
      expect(result.current.notification).toMatchObject({ type: "success" });
      expect(result.current.notification.message).toContain("Бузахур");
      expect(result.current.notification.message).toContain("7");
    });

    it("reports an archive that turned out to hold no cards", async () => {
      mocks.detectImportKind.mockResolvedValue({ kind: "inventory" });
      mocks.hasComponentRegistry.mockReturnValue(false);
      const empty = Object.assign(new Error("empty"), {
        code: "EMPTY_INVENTORY",
      });
      const onImportInventory = vi.fn().mockRejectedValue(empty);
      const { result } = renderSettings({ onImportInventory });

      await act(async () => result.current.handleImportFile(inventoryFile()));

      expect(result.current.notification).toMatchObject({ type: "warning" });
      expect(result.current.notification.message).toBe(
        "No components to import were found in the file.",
      );
    });

    // Без обработчика заведения проекта (экран настроек, поднятый в отрыве от
    // приложения) остаётся объяснение словами вместо внутренней ошибки.
    it("explains that the open project keeps no registry", async () => {
      mocks.detectImportKind.mockResolvedValue({ kind: "inventory" });
      mocks.hasComponentRegistry.mockReturnValue(false);
      const { result } = renderSettings();

      await act(async () => result.current.handleImportFile(inventoryFile()));

      expect(mocks.importInventoryFile).not.toHaveBeenCalled();
      expect(mocks.loadComponentRegistry).not.toHaveBeenCalled();
      expect(result.current.notification).toMatchObject({ type: "error" });
      expect(result.current.notification.message).toContain("Upstream");
    });

    it("ignores an inventory import with no project open", async () => {
      mocks.detectImportKind.mockResolvedValue({ kind: "inventory" });
      mocks.activeProject = null;
      const { result } = renderSettings();

      await act(async () => result.current.handleImportFile(inventoryFile()));

      expect(mocks.importInventoryFile).not.toHaveBeenCalled();
    });

    it("routes a workbook into the Excel import", async () => {
      mocks.detectImportKind.mockResolvedValue({ kind: "excel" });
      mocks.parseExcelImportFile.mockResolvedValue(excelResult());
      const { result } = renderSettings();

      await act(async () =>
        result.current.handleImportFile(inventoryFile("leaks.xlsx")),
      );

      expect(mocks.parseExcelImportFile).toHaveBeenCalled();
    });

    it("refuses a file it cannot identify", async () => {
      mocks.detectImportKind.mockResolvedValue({ kind: "unknown" });
      const { result } = renderSettings();

      await act(async () =>
        result.current.handleImportFile(inventoryFile("notes.txt")),
      );

      expect(result.current.notification).toMatchObject({ type: "error" });
      expect(result.current.notification.message).toContain("notes.txt");
    });

    it("reports a failure to inspect the file at all", async () => {
      mocks.detectImportKind.mockRejectedValue(new Error("unreadable"));
      const { result } = renderSettings();

      await act(async () => result.current.handleImportFile(inventoryFile()));

      expect(result.current.notification).toMatchObject({ type: "error" });
      expect(result.current.notification.message).toContain("unreadable");
      expect(mocks.importInventoryFile).not.toHaveBeenCalled();
    });

    it("does nothing when the picker is dismissed", async () => {
      const event = { target: { files: [], value: "chosen" } };
      const { result } = renderSettings();

      await act(async () => result.current.handleImportFile(event));

      expect(event.target.value).toBe("");
      expect(mocks.detectImportKind).not.toHaveBeenCalled();
    });
  });
});
