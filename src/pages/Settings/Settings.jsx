import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { useHiddenFields } from "@/app/project/hooks/useHiddenFields";
import { useExcelExportMode } from "@/app/project/hooks/useExcelExportMode";
import { getMapCacheInfo, clearMapCache } from "@/services/maps/tileCache";
import { saveMonitoringRound } from "@/utils/monitoringRound";
import PageHeader from "@/components/layout/PageHeader/PageHeader";
import FieldVisibilityModal from "@/features/fieldVisibility/FieldVisibilityModal/FieldVisibilityModal";
import Notification from "@/components/ui/Notification/Notification";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import ImportConflictSheet from "@/features/importConflict/ImportConflictSheet";
import AddProjectForm from "./components/AddProjectForm";
import AppearanceSection from "./components/AppearanceSection";
import BackupSection from "./components/BackupSection";
import DangerZoneSection from "./components/DangerZoneSection";
import EmissionsSummarySection from "./components/EmissionsSummarySection";
import FieldVisibilitySection from "./components/FieldVisibilitySection";
import MapCacheSection from "./components/MapCacheSection";
import ProjectIntegritySection from "./components/ProjectIntegritySection";
import ProjectList from "./components/ProjectList";
import { useBackupActions } from "./hooks/useBackupActions";
import { useProjectActions } from "./hooks/useProjectActions";
import { useSettingsTexts } from "./hooks/useSettingsTexts";
import s from "./Settings.module.scss";

export default function Settings({
  setPage,
  prevPage,
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
  } = useProjectActions({ setCacheInfo, notify });

  const saveExcelMonitoringRound = useCallback(
    (round) => {
      if (round) saveMonitoringRound(activeProject?.id, round);
    },
    [activeProject?.id],
  );

  const { vars } = useProjectVars(activeProject?.id ?? null);
  const { getPhoto: idbGetPhoto, savePhoto } = usePhotoStorage();
  const projectConfig = useProjectConfig();
  const { hiddenFields, setHiddenFields } = useHiddenFields(
    activeProject?.id ?? null,
  );
  const { monitoringExportMode, setMonitoringExportMode } = useExcelExportMode(
    activeProject?.id ?? null,
  );

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
  }, [data, idbGetPhoto, lang, notify]);

  const prepareExcelLeaks = useCallback(
    (leaks, { mode = "append" } = {}) => {
      const now = Date.now();
      const existingByTag = new Map(
        data
          .filter((leak) => leak?.leak_id != null)
          .map((leak) => [String(leak.leak_id), leak]),
      );

      return leaks.map((leak, index) => {
        const existing =
          mode === "merge" && leak.leak_id != null
            ? existingByTag.get(String(leak.leak_id))
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

        if (!result.leaks.length) {
          notify(
            "warning",
            lang === "ru"
              ? "В Excel не найдено строк для импорта"
              : "No importable rows found in Excel",
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
    [activeProject, data, idbGetPhoto, lang, notify, prepareExcelLeaks],
  );

  const persistPreparedExcelPhotos = useCallback(
    async (leaks) => {
      const { persistExcelImportPhotos } =
        await import("@/services/excelImportService");
      return persistExcelImportPhotos(leaks, savePhoto);
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
    if (!leaks.length) {
      setExcelImportState({ open: false });
      return;
    }

    const prepared = prepareExcelLeaks(leaks, {
      mode: data.length > 0 ? "append" : "overwrite",
    });

    try {
      setIsImportingExcel(true);
      notifyExcelImportProgress();
      const withPhotos = await persistPreparedExcelPhotos(prepared);
      await setData?.([...data, ...withPhotos]);
      saveExcelMonitoringRound(excelImportState.result?.monitoringRound);
      notify(
        "success",
        lang === "ru"
          ? `Импортировано из Excel: ${withPhotos.length} записей`
          : `Imported from Excel: ${withPhotos.length} records`,
      );
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Не удалось сохранить импорт" : "Failed to save import"}: ${error.message}`,
      );
    } finally {
      setIsImportingExcel(false);
      setExcelImportState({ open: false });
    }
  }, [
    data,
    excelImportState.result?.leaks,
    excelImportState.result?.monitoringRound,
    lang,
    notify,
    notifyExcelImportProgress,
    persistPreparedExcelPhotos,
    prepareExcelLeaks,
    saveExcelMonitoringRound,
    setData,
  ]);

  const cancelExcelImport = useCallback(() => {
    setExcelImportState({ open: false });
  }, []);

  const handleExcelConflictOverwrite = useCallback(async () => {
    const leaks = excelConflictState.result?.leaks ?? [];
    const prepared = prepareExcelLeaks(leaks, { mode: "overwrite" });

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
      const withPhotos = await persistPreparedExcelPhotos(reconciled.leaks);
      await setData?.(withPhotos);
      saveExcelMonitoringRound(excelConflictState.result?.monitoringRound);
      notify(
        "success",
        lang === "ru"
          ? `Проект перезаписан из Excel (${withPhotos.length} записей)`
          : `Project overwritten from Excel (${withPhotos.length} records)`,
      );
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Не удалось сохранить импорт" : "Failed to save import"}: ${error.message}`,
      );
    } finally {
      setIsImportingExcel(false);
      setExcelConflictState({ open: false });
    }
  }, [
    data,
    excelConflictState.result?.leaks,
    excelConflictState.result?.monitoringRound,
    idbGetPhoto,
    lang,
    notify,
    notifyExcelImportProgress,
    persistPreparedExcelPhotos,
    prepareExcelLeaks,
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
      const incomingWithPhotos = await persistPreparedExcelPhotos(incoming);
      const mergeResult = mergeLeaksByFreshness(data, incomingWithPhotos, {
        source: "excel",
      });
      await setData?.(mergeResult.leaks);
      saveExcelMonitoringRound(excelConflictState.result?.monitoringRound);
      notify(
        "success",
        lang === "ru"
          ? `Excel объединён с проектом: применено ${mergeResult.changed} записей`
          : `Excel merged into project: ${mergeResult.changed} records applied`,
      );
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Не удалось объединить Excel" : "Failed to merge Excel"}: ${error.message}`,
      );
    } finally {
      setIsImportingExcel(false);
      setExcelConflictState({ open: false });
    }
  }, [
    data,
    excelConflictState.preparedForMerge,
    excelConflictState.result?.leaks,
    excelConflictState.result?.monitoringRound,
    lang,
    notify,
    notifyExcelImportProgress,
    persistPreparedExcelPhotos,
    prepareExcelLeaks,
    saveExcelMonitoringRound,
    setData,
  ]);

  const handleExcelConflictCopy = useCallback(async () => {
    const leaks = excelConflictState.result?.leaks ?? [];
    const prepared = prepareExcelLeaks(leaks, { mode: "copy" });
    const copyName = `${activeProject?.name ?? "Excel import"} (Excel)`;

    try {
      setIsImportingExcel(true);
      notifyExcelImportProgress();
      const result = await onCreateExcelCopy?.({
        name: copyName,
        type: activeProject?.type,
        leaks: prepared,
        monitoringRound: excelConflictState.result?.monitoringRound,
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
    excelConflictState.result?.leaks,
    excelConflictState.result?.monitoringRound,
    lang,
    notify,
    notifyExcelImportProgress,
    onCreateExcelCopy,
    prepareExcelLeaks,
  ]);

  const handleSettingsConfirm = useCallback(async () => {
    if (settingsConfirmAction === "clearMapCache") {
      await clearMapCache();
      setCacheInfo({ count: 0, sizeMB: 0 });
      notify("success", localeTexts.notifications.cacheCleared);
    }

    if (settingsConfirmAction === "clearDatabase") {
      clearDatabase?.();
      notify("warning", localeTexts.notifications.databaseCleared);
    }

    setSettingsConfirmAction(null);
  }, [
    clearDatabase,
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

  return (
    <div className={s.settings}>
      <PageHeader
        title={localeTexts.title}
        onBack={() => setPage?.(prevPage ?? "")}
      />

      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      <div className={s.content}>
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>{localeTexts.projects}</h2>
            {!addingProject && (
              <button
                className={s.addBtn}
                type="button"
                onClick={() => setAddingProject(true)}
              >
                + {localeTexts.addProject}
              </button>
            )}
          </div>

          {addingProject && (
            <AddProjectForm
              onConfirm={(name, type) => {
                handleAdd(name, type);
                setAddingProject(false);
              }}
              onCancel={() => setAddingProject(false)}
            />
          )}

          <ProjectList
            projects={projects}
            activeId={activeProject?.id}
            onSelect={handleSelect}
            onRename={handleRename}
            onRemove={handleRemove}
          />

          {projects.length === 0 && !addingProject && (
            <p className={s.empty}>{localeTexts.noProjects}</p>
          )}
        </section>

        <AppearanceSection
          lang={lang}
          localeTexts={localeTexts}
          onToggleLanguage={toggleLanguage}
        />

        {activeProject && data.length > 0 && (
          <EmissionsSummarySection data={data} />
        )}

        <FieldVisibilitySection
          activeProject={activeProject}
          hiddenFields={hiddenFields}
          lang={lang}
          localeTexts={localeTexts}
          exportMode={monitoringExportMode}
          onConfigure={() => setFieldsModalOpen(true)}
          onExportModeChange={(nextMode) => {
            setMonitoringExportMode(nextMode);
            notify("success", localeTexts.notifications.excelExportModeSaved);
          }}
        />

        <BackupSection
          activeProject={activeProject}
          importExcelRef={importExcelRef}
          importZipRef={importZipRef}
          isExporting={isExportingZip}
          isImportingExcel={isImportingExcel}
          localeTexts={localeTexts}
          onExport={handleExportZip}
          onImportExcel={handleImportExcel}
          onImport={handleImportZip}
        />

        <ProjectIntegritySection
          activeProject={activeProject}
          lang={lang}
          report={integrityReport}
          checking={checkingIntegrity}
          onCheck={handleCheckIntegrity}
        />

        <MapCacheSection
          cacheInfo={cacheInfo}
          lang={lang}
          localeTexts={localeTexts}
          onClear={handleClearMapCache}
        />

        <DangerZoneSection
          activeProject={activeProject}
          localeTexts={localeTexts}
          onClearDatabase={handleClearDatabase}
        />
      </div>

      <ImportConflictSheet
        open={conflictState.open}
        projectName={conflictState.resolvedName}
        existingProject={conflictState.existingProject}
        leakCount={conflictState.leakCount}
        mergePreview={conflictState.mergePreview}
        onOverwrite={handleConflictOverwrite}
        onMerge={handleConflictMerge}
        onCopy={handleConflictCopy}
        onCancel={() => setConflictState({ open: false })}
      />

      <ImportConflictSheet
        open={excelConflictState.open}
        projectName={excelConflictState.projectName}
        existingProject={excelConflictState.existingProject}
        leakCount={excelConflictState.leakCount}
        mergePreview={excelConflictState.mergePreview}
        sourceLabel={lang === "ru" ? "в Excel" : "in Excel"}
        photoLabel={lang === "ru" ? "Фото Excel" : "Excel photos"}
        onOverwrite={handleExcelConflictOverwrite}
        onMerge={handleExcelConflictMerge}
        onCopy={handleExcelConflictCopy}
        onCancel={() => setExcelConflictState({ open: false })}
      />

      <ConfirmSheet
        open={Boolean(settingsConfirmTexts)}
        title={settingsConfirmTexts?.title}
        description={settingsConfirmTexts?.description}
        confirmLabel={settingsConfirmTexts?.confirmLabel}
        cancelLabel={lang === "ru" ? "Отмена" : "Cancel"}
        onConfirm={handleSettingsConfirm}
        onCancel={() => setSettingsConfirmAction(null)}
      />

      <ConfirmSheet
        open={projectSwitchState.open}
        title={projectSwitchState.title}
        description={projectSwitchState.description}
        confirmLabel={projectSwitchState.confirmLabel}
        cancelLabel={projectSwitchState.cancelLabel}
        onConfirm={confirmProjectSwitch}
        onCancel={cancelProjectSwitch}
      />

      <ConfirmSheet
        open={importConfirmState.open}
        title={importConfirmState.title}
        description={importConfirmState.description}
        confirmLabel={importConfirmState.confirmLabel}
        cancelLabel={importConfirmState.cancelLabel}
        onConfirm={confirmImport}
        onCancel={cancelImport}
      />

      <ConfirmSheet
        open={excelImportState.open}
        title={lang === "ru" ? "Импортировать Excel?" : "Import Excel?"}
        description={
          excelImportState.result
            ? lang === "ru"
              ? `Файл: ${excelImportState.fileName}. Лист: ${excelImportState.result.sheetName}. Найдено строк: ${excelImportState.result.stats.totalRows}; будет импортировано: ${excelImportState.result.stats.imported}; мониторинг: ${excelImportState.result.stats.monitoringRecords ?? 0}; фото: ${excelImportState.result.stats.restoredPhotos ?? 0}; пропущено: ${excelImportState.result.stats.skipped}.`
              : `File: ${excelImportState.fileName}. Sheet: ${excelImportState.result.sheetName}. Rows found: ${excelImportState.result.stats.totalRows}; to import: ${excelImportState.result.stats.imported}; monitoring: ${excelImportState.result.stats.monitoringRecords ?? 0}; photos: ${excelImportState.result.stats.restoredPhotos ?? 0}; skipped: ${excelImportState.result.stats.skipped}.`
            : ""
        }
        confirmLabel={lang === "ru" ? "Импортировать" : "Import"}
        cancelLabel={lang === "ru" ? "Отмена" : "Cancel"}
        onConfirm={confirmExcelImport}
        onCancel={cancelExcelImport}
      />

      {activeProject && (
        <FieldVisibilityModal
          open={fieldsModalOpen}
          onClose={() => setFieldsModalOpen(false)}
          config={projectConfig}
          hiddenFields={hiddenFields}
          onSave={(next) => {
            setHiddenFields(next);
            setFieldsModalOpen(false);
            notify(
              "success",
              next.size > 0
                ? t("settings.notifications.hiddenFieldsCount", {
                    count: next.size,
                  })
                : localeTexts.notifications.allFieldsActive,
            );
          }}
        />
      )}
    </div>
  );
}
