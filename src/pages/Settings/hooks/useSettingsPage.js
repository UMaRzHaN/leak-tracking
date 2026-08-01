import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { useHiddenFields } from "@/app/project/hooks/useHiddenFields";
import { useExcelExportMode } from "@/app/project/hooks/useExcelExportMode";
import { usePhotoRequirements } from "@/app/project/hooks/usePhotoRequirements";
import { getMapCacheInfo, clearMapCache } from "@/services/maps/tileCache";
import {
  readMonitoringRound,
  saveMonitoringRound,
} from "@/utils/monitoringRound";
import {
  readProjectSettings,
  writeProjectSettings,
} from "@/app/project/projectSettings";
import {
  readProjectSyncStateAsync,
  writeProjectSyncState,
} from "@/services/projectSyncState";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { runExcelImportTransaction } from "@/services/excelImportTransaction";
import { readImportOperation } from "@/services/importOperationJournal";
import { useBackupActions } from "./useBackupActions";
import { useProjectActions } from "./useProjectActions";
import { useSettingsTexts } from "./useSettingsTexts";
import { useLocalSync } from "./useLocalSync";
import { performSettingsCleanup } from "../settingsCleanup";
import { resolvePortableExcelArchiveRoute } from "../excelArchiveRouting";

export function useSettingsPage({
  data = [],
  setData,
  clearDatabase,
  onImportZip,
  onImportIntoExisting,
  onCreateExcelCopy,
}) {
  const { lang, t, toggleLanguage, localeTexts } = useSettingsTexts();
  const [notification, setNotification] = useState(null);
  const [fieldsModalOpen, setFieldsModalOpen] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [settingsConfirmAction, setSettingsConfirmAction] = useState(null);
  const [integrityReport, setIntegrityReport] = useState(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [excelImportState, setExcelImportState] = useState({ open: false });
  const [excelConflictState, setExcelConflictState] = useState({
    open: false,
  });
  const importExcelRef = useRef(null);

  const notify = useCallback((type, message, options = {}) => {
    setNotification({ type, message, ...options });
  }, []);

  useEffect(() => {
    getMapCacheInfo()
      .then(setCacheInfo)
      .catch(() => setCacheInfo({ count: 0, sizeMB: 0 }));
  }, []);

  const {
    projects,
    activeProject,
    handleSelect,
    projectSwitchState,
    confirmProjectSwitch,
    cancelProjectSwitch,
    handleRename,
    handleRemove,
    handleAdd,
    handleChangeSyncId,
    syncIdEditorState,
    updateSyncIdEditorValue,
    confirmSyncIdEditor,
    cancelSyncIdEditor,
    restoreProjectMetadata,
    restoreProjectSnapshot,
    ensureProjectSyncId,
  } = useProjectActions({ setCacheInfo, notify });

  useEffect(() => {
    const interrupted = readImportOperation(activeProject?.id);
    if (!interrupted) return;
    notify(
      "error",
      lang === "ru"
        ? "Обнаружен прерванный импорт. Проверьте данные проекта и повторите импорт из исходного файла."
        : "An interrupted import was detected. Verify the project data and retry from the source file.",
      { autoCloseMs: 0 },
    );
  }, [activeProject?.id, lang, notify]);

  const saveExcelMonitoringRound = useCallback(
    (round) => {
      if (round) saveMonitoringRound(activeProject?.id, round);
    },
    [activeProject?.id],
  );

  const { vars, setVarsAsync } = useProjectVars(activeProject?.id ?? null);
  const applyExcelArchiveMetadata = useCallback(
    async (result, leaks = []) => {
      if (!result || !activeProject?.id) return;
      if (result.project) {
        restoreProjectMetadata(activeProject.id, result.project);
      }
      if (result.vars) await setVarsAsync(result.vars);
      if (result.settings) {
        writeProjectSettings(activeProject.id, result.settings);
      }
      if (result.portableArchive) {
        saveMonitoringRound(activeProject.id, result.monitoringRound ?? null);
      }
      if (result.sync) {
        await writeProjectSyncState(activeProject.id, result.sync, leaks);
      }
    },
    [activeProject?.id, restoreProjectMetadata, setVarsAsync],
  );

  const captureExcelImportSnapshot = useCallback(async () => {
    const projectId = activeProject?.id;
    if (!projectId) return null;
    return {
      project: { ...activeProject },
      varsRaw: localStorage.getItem(STORAGE_KEYS.PROJECT_VARS(projectId)),
      settings: readProjectSettings(projectId),
      monitoringRound: readMonitoringRound(projectId),
      sync: await readProjectSyncStateAsync(projectId),
    };
  }, [activeProject]);

  const restoreExcelImportSnapshot = useCallback(
    async (snapshot) => {
      const projectId = snapshot?.project?.id;
      if (!projectId) return;
      if (!restoreProjectSnapshot(projectId, snapshot.project)) {
        throw new Error("Failed to restore project metadata");
      }
      const varsKey = STORAGE_KEYS.PROJECT_VARS(projectId);
      if (snapshot.varsRaw == null) localStorage.removeItem(varsKey);
      else localStorage.setItem(varsKey, snapshot.varsRaw);
      window.dispatchEvent(
        new CustomEvent("project-vars-updated", { detail: { projectId } }),
      );
      writeProjectSettings(projectId, snapshot.settings);
      saveMonitoringRound(projectId, snapshot.monitoringRound);
      await writeProjectSyncState(projectId, snapshot.sync, data);
    },
    [data, restoreProjectSnapshot],
  );
  const { getPhoto: idbGetPhoto, savePhoto, deletePhoto } = usePhotoStorage();
  const projectConfig = useProjectConfig();
  const { hiddenFields, setHiddenFields } = useHiddenFields(
    activeProject?.id ?? null,
  );
  const { monitoringExportMode, setMonitoringExportMode } = useExcelExportMode(
    activeProject?.id ?? null,
  );
  const {
    leakPhotoRequired,
    monitoringPhotoRequired,
    setLeakPhotoRequired,
    setMonitoringPhotoRequired,
  } = usePhotoRequirements(activeProject?.id ?? null);

  const {
    importZipRef,
    handleExportZip,
    isExportingZip,
    handleImportZip,
    importConfirmState,
    confirmImport,
    cancelImport,
    conflictState,
    setConflictState,
    handleConflictOverwrite,
    handleConflictMerge,
    handleConflictCopy,
  } = useBackupActions({
    data,
    idbGetPhoto,
    activeProject,
    vars,
    onImportZip,
    onImportIntoExisting,
    notify,
    projects,
  });

  const localSync = useLocalSync({
    activeProject,
    data,
    idbGetPhoto,
    vars,
    onImportZip,
    onImportIntoExisting,
    notify,
    lang,
    ensureProjectSyncId,
  });

  const handleClearMapCache = useCallback(() => {
    setSettingsConfirmAction("clearMapCache");
  }, []);

  const handleClearDatabase = useCallback(() => {
    setSettingsConfirmAction("clearDatabase");
  }, []);

  const handleCheckIntegrity = useCallback(async () => {
    setCheckingIntegrity(true);
    try {
      const { analyzeProjectIntegrity } =
        await import("@/services/projectIntegrityService");
      const report = await analyzeProjectIntegrity(data, {
        idbGetPhoto,
        leakPhotoRequired,
        monitoringPhotoRequired,
      });
      setIntegrityReport(report);
      notify(
        report.ok ? "success" : "warning",
        report.ok
          ? lang === "ru"
            ? "Проблем в данных не найдено"
            : "No data issues found"
          : lang === "ru"
            ? `Проверка завершена: ${report.issues} проблем`
            : `Check complete: ${report.issues} issues`,
      );
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Ошибка проверки" : "Check error"}: ${error.message}`,
      );
    } finally {
      setCheckingIntegrity(false);
    }
  }, [
    data,
    idbGetPhoto,
    lang,
    leakPhotoRequired,
    monitoringPhotoRequired,
    notify,
  ]);

  const prepareExcelLeaks = useCallback(
    (leaks, { mode = "append" } = {}) => {
      const now = Date.now();
      const existingByTag = new Map(
        data
          .map((leak) => [String(leak?.leak_id ?? "").trim(), leak])
          .filter(([tag]) => tag),
      );

      return leaks.map((leak, index) => {
        const existing =
          mode === "merge" && String(leak?.leak_id ?? "").trim()
            ? existingByTag.get(String(leak.leak_id).trim())
            : null;

        return {
          ...leak,
          id: existing?.id ?? now + index,
          index:
            mode === "overwrite" || mode === "copy"
              ? index + 1
              : (existing?.index ?? data.length + index + 1),
          importedFromExcel: true,
          importedAt: now,
        };
      });
    },
    [data],
  );

  const handleImportExcel = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !activeProject) return;

      setIsImportingExcel(true);
      notify(
        "info",
        lang === "ru"
          ? "Идёт чтение Excel, подождите..."
          : "Reading Excel file, please wait...",
        { autoCloseMs: 0 },
      );

      try {
        const { parseExcelImportFile, reconcileExcelImportPhotos } =
          await import("@/services/excelImportService");
        const result = await parseExcelImportFile(file, {
          projectType: activeProject.type,
        });

        if (!result.leaks.length && !result.portableArchive) {
          notify(
            "warning",
            lang === "ru"
              ? "В Excel не найдено строк для импорта"
              : "No importable rows found in Excel",
          );
          return;
        }

        const archiveRoute = resolvePortableExcelArchiveRoute({
          result,
          projects,
          activeProject,
        });
        if (
          archiveRoute.action === "create" &&
          typeof onCreateExcelCopy === "function"
        ) {
          const created = await onCreateExcelCopy({
            name: archiveRoute.name,
            type: result.project.type,
            leaks: result.leaks,
            monitoringRound: result.monitoringRound,
            vars: result.vars,
            settings: result.settings,
            syncId: result.project.syncId,
            sync: result.sync,
          });
          notify(
            "success",
            lang === "ru"
              ? `Импортирован проект «${created?.project?.name ?? archiveRoute.name}» (${result.leaks.length} записей)`
              : `Project "${created?.project?.name ?? archiveRoute.name}" imported (${result.leaks.length} records)`,
          );
          return;
        }

        if (data.length > 0) {
          const { previewMergeLeaks } =
            await import("@/services/projectBackupService");
          const prepared = prepareExcelLeaks(result.leaks, {
            mode: "merge",
          });
          const reconciled = await reconcileExcelImportPhotos(
            data,
            prepared,
            idbGetPhoto,
            { preserveExisting: true },
          );
          const preparedForMerge = reconciled.leaks;
          const mergePreview = previewMergeLeaks(data, preparedForMerge, {
            source: "excel",
            inferredStatusLeakIds: result.inferredStatusLeakIds,
          });
          mergePreview.excelPhotos = reconciled.photos;
          mergePreview.photoStats = reconciled.photos;

          setExcelConflictState({
            open: true,
            fileName: file.name,
            result,
            preparedForMerge,
            projectName: activeProject.name,
            existingProject: { ...activeProject, leakCount: data.length },
            leakCount: result.leaks.length,
            mergePreview,
          });
        } else {
          setExcelImportState({
            open: true,
            fileName: file.name,
            result,
          });
        }

        notify(
          "success",
          lang === "ru"
            ? `Excel прочитан: ${result.leaks.length} записей, фото: ${result.stats.restoredPhotos ?? 0}`
            : `Excel parsed: ${result.leaks.length} records, photos: ${result.stats.restoredPhotos ?? 0}`,
        );
      } catch (error) {
        notify(
          "error",
          `${lang === "ru" ? "Ошибка импорта Excel" : "Excel import error"}: ${error.message}`,
        );
      } finally {
        setIsImportingExcel(false);
      }
    },
    [
      activeProject,
      data,
      idbGetPhoto,
      lang,
      notify,
      onCreateExcelCopy,
      prepareExcelLeaks,
      projects,
    ],
  );

  const persistPreparedExcelPhotos = useCallback(
    async (leaks) => {
      const { persistExcelImportPhotos } =
        await import("@/services/excelImportService");
      return persistExcelImportPhotos(leaks, savePhoto, {
        returnTransaction: true,
      });
    },
    [savePhoto],
  );

  const notifyExcelImportProgress = useCallback(() => {
    notify(
      "info",
      lang === "ru"
        ? "Идёт импорт Excel, подождите..."
        : "Excel import in progress, please wait...",
      { autoCloseMs: 0 },
    );
  }, [lang, notify]);

  const confirmExcelImport = useCallback(async () => {
    const leaks = excelImportState.result?.leaks ?? [];
    if (!leaks.length && !excelImportState.result?.portableArchive) {
      setExcelImportState({ open: false });
      return;
    }

    const prepared = excelImportState.result?.portableArchive
      ? leaks
      : prepareExcelLeaks(leaks, {
          mode: data.length > 0 ? "append" : "overwrite",
        });

    try {
      setIsImportingExcel(true);
      notifyExcelImportProgress();
      const snapshot = await captureExcelImportSnapshot();
      const withPhotos = await runExcelImportTransaction({
        projectId: activeProject?.id,
        persistPhotos: () => persistPreparedExcelPhotos(prepared),
        commit: async (persisted) => {
          await setData?.([...data, ...persisted]);
          await applyExcelArchiveMetadata(excelImportState.result, persisted);
          if (!excelImportState.result?.portableArchive) {
            saveExcelMonitoringRound(excelImportState.result?.monitoringRound);
          }
        },
        rollbackState: async () => {
          await setData?.(data);
          await restoreExcelImportSnapshot(snapshot);
        },
        deletePhoto,
      });
      notify(
        "success",
        lang === "ru"
          ? `Импортировано из Excel: ${withPhotos.length} записей`
          : `Imported from Excel: ${withPhotos.length} records`,
      );
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Не удалось сохранить импорт" : "Failed to save import"}: ${error.message}${error.rollbackError ? `; rollback: ${error.rollbackError.message}` : ""}${error.photoRollbackErrors?.length ? `; photo rollback: ${error.photoRollbackErrors.length}` : ""}`,
      );
    } finally {
      setIsImportingExcel(false);
      setExcelImportState({ open: false });
    }
  }, [
    activeProject?.id,
    applyExcelArchiveMetadata,
    captureExcelImportSnapshot,
    data,
    deletePhoto,
    excelImportState.result,
    lang,
    notify,
    notifyExcelImportProgress,
    persistPreparedExcelPhotos,
    prepareExcelLeaks,
    restoreExcelImportSnapshot,
    saveExcelMonitoringRound,
    setData,
  ]);

  const cancelExcelImport = useCallback(() => {
    setExcelImportState({ open: false });
  }, []);

  const handleExcelConflictOverwrite = useCallback(async () => {
    const leaks = excelConflictState.result?.leaks ?? [];
    const prepared = excelConflictState.result?.portableArchive
      ? leaks
      : prepareExcelLeaks(leaks, { mode: "overwrite" });

    try {
      setIsImportingExcel(true);
      notifyExcelImportProgress();
      const { reconcileExcelImportPhotos } =
        await import("@/services/excelImportService");
      const reconciled = await reconcileExcelImportPhotos(
        data,
        prepared,
        idbGetPhoto,
      );
      const snapshot = await captureExcelImportSnapshot();
      const withPhotos = await runExcelImportTransaction({
        projectId: activeProject?.id,
        persistPhotos: () => persistPreparedExcelPhotos(reconciled.leaks),
        commit: async (persisted) => {
          await setData?.(persisted);
          await applyExcelArchiveMetadata(excelConflictState.result, persisted);
          if (!excelConflictState.result?.portableArchive) {
            saveExcelMonitoringRound(
              excelConflictState.result?.monitoringRound,
            );
          }
        },
        rollbackState: async () => {
          await setData?.(data);
          await restoreExcelImportSnapshot(snapshot);
        },
        deletePhoto,
      });
      notify(
        "success",
        lang === "ru"
          ? `Проект перезаписан из Excel (${withPhotos.length} записей)`
          : `Project overwritten from Excel (${withPhotos.length} records)`,
      );
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Не удалось сохранить импорт" : "Failed to save import"}: ${error.message}${error.rollbackError ? `; rollback: ${error.rollbackError.message}` : ""}${error.photoRollbackErrors?.length ? `; photo rollback: ${error.photoRollbackErrors.length}` : ""}`,
      );
    } finally {
      setIsImportingExcel(false);
      setExcelConflictState({ open: false });
    }
  }, [
    activeProject?.id,
    applyExcelArchiveMetadata,
    captureExcelImportSnapshot,
    data,
    deletePhoto,
    excelConflictState.result,
    idbGetPhoto,
    lang,
    notify,
    notifyExcelImportProgress,
    persistPreparedExcelPhotos,
    prepareExcelLeaks,
    restoreExcelImportSnapshot,
    saveExcelMonitoringRound,
    setData,
  ]);

  const handleExcelConflictMerge = useCallback(async () => {
    const incoming =
      excelConflictState.preparedForMerge ??
      prepareExcelLeaks(excelConflictState.result?.leaks ?? [], {
        mode: "merge",
      });

    try {
      setIsImportingExcel(true);
      notifyExcelImportProgress();
      const { mergeLeaksByFreshness } =
        await import("@/services/projectBackupService");
      const snapshot = await captureExcelImportSnapshot();
      let mergeResult;
      await runExcelImportTransaction({
        projectId: activeProject?.id,
        persistPhotos: () => persistPreparedExcelPhotos(incoming),
        commit: async (incomingWithPhotos) => {
          mergeResult = mergeLeaksByFreshness(data, incomingWithPhotos, {
            source: "excel",
            inferredStatusLeakIds:
              excelConflictState.result?.inferredStatusLeakIds,
          });
          await setData?.(mergeResult.leaks);
          saveExcelMonitoringRound(excelConflictState.result?.monitoringRound);
        },
        rollbackState: async () => {
          await setData?.(data);
          await restoreExcelImportSnapshot(snapshot);
        },
        deletePhoto,
      });
      notify(
        "success",
        lang === "ru"
          ? `Excel объединён с проектом: применено ${mergeResult.changed} записей`
          : `Excel merged into project: ${mergeResult.changed} records applied`,
      );
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Не удалось объединить Excel" : "Failed to merge Excel"}: ${error.message}${error.rollbackError ? `; rollback: ${error.rollbackError.message}` : ""}${error.photoRollbackErrors?.length ? `; photo rollback: ${error.photoRollbackErrors.length}` : ""}`,
      );
    } finally {
      setIsImportingExcel(false);
      setExcelConflictState({ open: false });
    }
  }, [
    activeProject?.id,
    captureExcelImportSnapshot,
    data,
    deletePhoto,
    excelConflictState.preparedForMerge,
    excelConflictState.result,
    lang,
    notify,
    notifyExcelImportProgress,
    persistPreparedExcelPhotos,
    prepareExcelLeaks,
    restoreExcelImportSnapshot,
    saveExcelMonitoringRound,
    setData,
  ]);

  const handleExcelConflictCopy = useCallback(async () => {
    const leaks = excelConflictState.result?.leaks ?? [];
    const prepared = excelConflictState.result?.portableArchive
      ? leaks
      : prepareExcelLeaks(leaks, { mode: "copy" });
    const copyName = `${excelConflictState.result?.project?.name || activeProject?.name || "Excel import"} (Excel)`;

    try {
      setIsImportingExcel(true);
      notifyExcelImportProgress();
      const result = await onCreateExcelCopy?.({
        name: copyName,
        type: excelConflictState.result?.project?.type || activeProject?.type,
        leaks: prepared,
        monitoringRound: excelConflictState.result?.monitoringRound,
        vars: excelConflictState.result?.vars,
        settings: excelConflictState.result?.settings,
        syncId: excelConflictState.result?.project?.syncId,
        sync: excelConflictState.result?.sync,
      });
      notify(
        "success",
        lang === "ru"
          ? `Создана копия «${result?.project?.name ?? copyName}» (${prepared.length} записей)`
          : `Copy "${result?.project?.name ?? copyName}" created (${prepared.length} records)`,
      );
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Не удалось создать копию" : "Failed to create copy"}: ${error.message}`,
      );
    } finally {
      setIsImportingExcel(false);
      setExcelConflictState({ open: false });
    }
  }, [
    activeProject?.name,
    activeProject?.type,
    excelConflictState.result,
    lang,
    notify,
    notifyExcelImportProgress,
    onCreateExcelCopy,
    prepareExcelLeaks,
  ]);

  const handleSettingsConfirm = useCallback(async () => {
    try {
      const completedAction = await performSettingsCleanup(
        settingsConfirmAction,
        { clearMapCache, clearDatabase },
      );

      if (completedAction === "clearMapCache") {
        setCacheInfo({ count: 0, sizeMB: 0 });
        notify("success", localeTexts.notifications.cacheCleared);
      }

      if (completedAction === "clearDatabase") {
        notify("warning", localeTexts.notifications.databaseCleared);
      }
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Не удалось выполнить очистку" : "Cleanup failed"}: ${error.message}`,
      );
    } finally {
      setSettingsConfirmAction(null);
    }
  }, [
    clearDatabase,
    lang,
    localeTexts.notifications.cacheCleared,
    localeTexts.notifications.databaseCleared,
    notify,
    settingsConfirmAction,
  ]);

  const settingsConfirmTexts = useMemo(() => {
    if (settingsConfirmAction === "clearMapCache") {
      return {
        title: localeTexts.clearMapCache,
        description: localeTexts.dialogs.clearMapCache,
        confirmLabel: localeTexts.clearMapCache,
      };
    }

    if (settingsConfirmAction === "clearDatabase") {
      return {
        title: localeTexts.clearDatabase,
        description: localeTexts.dialogs.clearDatabase,
        confirmLabel: localeTexts.clearDatabase,
      };
    }

    return null;
  }, [
    localeTexts.clearDatabase,
    localeTexts.clearMapCache,
    localeTexts.dialogs.clearDatabase,
    localeTexts.dialogs.clearMapCache,
    settingsConfirmAction,
  ]);

  return {
    activeProject,
    addingProject,
    cacheInfo,
    cancelExcelImport,
    cancelImport,
    cancelProjectSwitch,
    cancelSyncIdEditor,
    checkingIntegrity,
    confirmExcelImport,
    confirmImport,
    confirmProjectSwitch,
    confirmSyncIdEditor,
    conflictState,
    excelConflictState,
    excelImportState,
    fieldsModalOpen,
    handleAdd,
    handleChangeSyncId,
    handleCheckIntegrity,
    handleClearDatabase,
    handleClearMapCache,
    handleConflictCopy,
    handleConflictMerge,
    handleConflictOverwrite,
    handleExcelConflictCopy,
    handleExcelConflictMerge,
    handleExcelConflictOverwrite,
    handleExportZip,
    handleImportExcel,
    handleImportZip,
    handleRemove,
    handleRename,
    handleSelect,
    handleSettingsConfirm,
    hiddenFields,
    importConfirmState,
    importExcelRef,
    importZipRef,
    integrityReport,
    isExportingZip,
    isImportingExcel,
    lang,
    leakPhotoRequired,
    localSync,
    localeTexts,
    monitoringExportMode,
    monitoringPhotoRequired,
    notification,
    notify,
    projectConfig,
    projects,
    projectSwitchState,
    setAddingProject,
    setExcelConflictState,
    setFieldsModalOpen,
    setHiddenFields,
    setIntegrityReport,
    setMonitoringExportMode,
    setLeakPhotoRequired,
    setMonitoringPhotoRequired,
    setNotification,
    setSettingsConfirmAction,
    setConflictState,
    settingsConfirmTexts,
    syncIdEditorState,
    t,
    toggleLanguage,
    updateSyncIdEditorValue,
  };
}
