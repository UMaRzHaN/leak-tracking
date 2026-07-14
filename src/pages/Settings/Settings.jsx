import { useState, useCallback, useEffect, useMemo } from "react";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { useProjectData } from "@/app/hooks/useProjectData";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { useHiddenFields } from "@/app/project/hooks/useHiddenFields";
import { useExcelExportMode } from "@/app/project/hooks/useExcelExportMode";
import { getMapCacheInfo, clearMapCache } from "@/services/maps/tileCache";
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
  clearDatabase,
  onImportZip,
  onImportIntoExisting,
}) {
  const { lang, t, toggleLanguage, localeTexts } = useSettingsTexts();
  const [notification, setNotification] = useState(null);
  const [fieldsModalOpen, setFieldsModalOpen] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [settingsConfirmAction, setSettingsConfirmAction] = useState(null);
  const [integrityReport, setIntegrityReport] = useState(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);

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

  const { vars } = useProjectVars(activeProject?.id ?? null);
  const { data } = useProjectData();
  const { getPhoto: idbGetPhoto } = usePhotoStorage();
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
          importZipRef={importZipRef}
          isExporting={isExportingZip}
          localeTexts={localeTexts}
          onExport={handleExportZip}
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
