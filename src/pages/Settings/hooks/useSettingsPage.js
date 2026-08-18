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
} from "@/services/sync/projectSyncState";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import {
  getExcelImportTransactionWarning,
  runExcelImportTransaction,
} from "@/services/import/excelImportTransaction";
import { readImportOperation } from "@/services/import/importOperationJournal";
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
  const [excelImportState, setExcelImportState] = useState(
    /** @type {any} */ ({ open: false }),
  );
  const [excelConflictState, setExcelConflictState] = useState(
    /** @type {any} */ ({ open: false }),
  );
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
    notify("error", t("settings.anInterruptedImportWas"), { autoCloseMs: 0 });
    // `t` is deliberately absent. It is read when the notice fires, and
    // depending on its identity would re-notify on every render — the
    // useSettingsTexts mock hands out a fresh one each call, which turned this
    // into an infinite render loop that exhausted the test worker's heap.
    /* eslint-disable-next-line react-hooks/exhaustive-deps,
       @eslint-react/exhaustive-deps */
  }, [activeProject?.id, notify]);
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
    componentPhotoRequired,
    setLeakPhotoRequired,
    setMonitoringPhotoRequired,
    setComponentPhotoRequired,
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
    t,
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
        await import("@/services/backup/projectIntegrityService");
      const report = await analyzeProjectIntegrity(data, {
        idbGetPhoto,
        leakPhotoRequired,
        monitoringPhotoRequired,
      });
      setIntegrityReport(report);
      notify(
        report.ok ? "success" : "warning",
        report.ok
          ? t("settings.noDataIssuesFound")
          : t("settings.checkCompleteVIssues", { v1: report.issues }),
      );
    } catch (error) {
      notify("error", `${t("settings.checkError")}: ${error.message}`);
    } finally {
      setCheckingIntegrity(false);
    }
  }, [
    data,
    idbGetPhoto,
    leakPhotoRequired,
    monitoringPhotoRequired,
    notify,
    t,
  ]);

  const prepareExcelLeaks = useCallback(
    (leaks, { mode = "append" } = {}) => {
      const now = Date.now();
      const existingByTag = new Map(
        /** @type {[string, any][]} */ (
          data
            .map((leak) => [String(leak?.leak_id ?? "").trim(), leak])
            .filter(([tag]) => Boolean(tag))
        ),
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
      notify("info", t("settings.readingExcelFilePlease"), { autoCloseMs: 0 });

      try {
        const { parseExcelImportFile, reconcileExcelImportPhotos } =
          await import("@/services/import/excelImportService");
        const result = await parseExcelImportFile(file, {
          projectType: activeProject.type,
        });

        if (!result.leaks.length && !result.portableArchive) {
          notify("warning", t("settings.noImportableRowsFound"));
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
            t("settings.projectVImportedV2", {
              v1: created?.project?.name ?? archiveRoute.name,
              v2: result.leaks.length,
            }),
          );
          return;
        }

        if (data.length > 0) {
          const { previewMergeLeaks } =
            await import("@/services/backup/projectBackupService");
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
          const mergePreview = /** @type {any} */ (
            previewMergeLeaks(data, preparedForMerge, {
              source: "excel",
              inferredStatusLeakIds: result.inferredStatusLeakIds,
            })
          );
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
          t("settings.excelParsedVRecords", {
            v1: result.leaks.length,
            v2: result.stats.restoredPhotos ?? 0,
          }),
        );
      } catch (error) {
        notify("error", `${t("settings.excelImportError")}: ${error.message}`);
      } finally {
        setIsImportingExcel(false);
      }
    },
    [
      activeProject,
      data,
      idbGetPhoto,
      notify,
      onCreateExcelCopy,
      prepareExcelLeaks,
      projects,
      t,
    ],
  );

  const persistPreparedExcelPhotos = useCallback(
    async (leaks) => {
      const { persistExcelImportPhotos } =
        await import("@/services/import/excelImportService");
      return persistExcelImportPhotos(leaks, savePhoto, {
        returnTransaction: true,
      });
    },
    [savePhoto],
  );

  const notifyExcelImportProgress = useCallback(() => {
    notify("info", t("settings.excelImportInProgress"), { autoCloseMs: 0 });
    // See above: the translator is read at call time, not depended upon.
    /* eslint-disable-next-line react-hooks/exhaustive-deps,
       @eslint-react/exhaustive-deps */
  }, [notify]);
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
      const transactionWarning = getExcelImportTransactionWarning(withPhotos);
      notify(
        transactionWarning ? "warning" : "success",
        transactionWarning
          ? t("settings.importedVRecordsBut", { v1: withPhotos.length })
          : t("settings.importedFromExcelV", { v1: withPhotos.length }),
      );
    } catch (error) {
      notify(
        "error",
        `${t("settings.failedToSaveImport")}: ${error.message}${error.rollbackError ? `; rollback: ${error.rollbackError.message}` : ""}${error.photoRollbackErrors?.length ? `; photo rollback: ${error.photoRollbackErrors.length}` : ""}`,
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
    notify,
    notifyExcelImportProgress,
    persistPreparedExcelPhotos,
    prepareExcelLeaks,
    restoreExcelImportSnapshot,
    saveExcelMonitoringRound,
    setData,
    t,
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
        await import("@/services/import/excelImportService");
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
      const transactionWarning = getExcelImportTransactionWarning(withPhotos);
      notify(
        transactionWarning ? "warning" : "success",
        transactionWarning
          ? t("settings.projectOverwrittenVRecords", { v1: withPhotos.length })
          : t("settings.projectOverwrittenFromExcel", {
              v1: withPhotos.length,
            }),
      );
    } catch (error) {
      notify(
        "error",
        `${t("settings.failedToSaveImport")}: ${error.message}${error.rollbackError ? `; rollback: ${error.rollbackError.message}` : ""}${error.photoRollbackErrors?.length ? `; photo rollback: ${error.photoRollbackErrors.length}` : ""}`,
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
    notify,
    notifyExcelImportProgress,
    persistPreparedExcelPhotos,
    prepareExcelLeaks,
    restoreExcelImportSnapshot,
    saveExcelMonitoringRound,
    setData,
    t,
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
        await import("@/services/backup/projectBackupService");
      const snapshot = await captureExcelImportSnapshot();
      let mergeResult;
      const importedLeaks = await runExcelImportTransaction({
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
      const transactionWarning =
        getExcelImportTransactionWarning(importedLeaks);
      const appliedCount = /** @type {any} */ (mergeResult)?.changed ?? 0;
      notify(
        transactionWarning ? "warning" : "success",
        transactionWarning
          ? t("settings.excelWasMergedBut")
          : t("settings.excelMergedIntoProject", { v1: appliedCount }),
      );
    } catch (error) {
      notify(
        "error",
        `${t("settings.failedToMergeExcel")}: ${error.message}${error.rollbackError ? `; rollback: ${error.rollbackError.message}` : ""}${error.photoRollbackErrors?.length ? `; photo rollback: ${error.photoRollbackErrors.length}` : ""}`,
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
    notify,
    notifyExcelImportProgress,
    persistPreparedExcelPhotos,
    prepareExcelLeaks,
    restoreExcelImportSnapshot,
    saveExcelMonitoringRound,
    setData,
    t,
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
        t("settings.copyVCreatedV2", {
          v1: result?.project?.name ?? copyName,
          v2: prepared.length,
        }),
      );
    } catch (error) {
      notify("error", `${t("settings.failedToCreateCopy")}: ${error.message}`);
    } finally {
      setIsImportingExcel(false);
      setExcelConflictState({ open: false });
    }
  }, [
    activeProject?.name,
    activeProject?.type,
    excelConflictState.result,
    notify,
    notifyExcelImportProgress,
    onCreateExcelCopy,
    prepareExcelLeaks,
    t,
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
      notify("error", `${t("settings.cleanupFailed")}: ${error.message}`);
    } finally {
      setSettingsConfirmAction(null);
    }
  }, [
    clearDatabase,
    localeTexts.notifications.cacheCleared,
    localeTexts.notifications.databaseCleared,
    notify,
    settingsConfirmAction,
    t,
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
    componentPhotoRequired,
    setComponentPhotoRequired,
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
