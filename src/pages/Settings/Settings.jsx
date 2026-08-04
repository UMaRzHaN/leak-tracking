import PageHeader from "@/components/layout/PageHeader/PageHeader";
import FieldVisibilityModal from "@/features/fieldVisibility/FieldVisibilityModal";
import Notification from "@/components/ui/Notification/Notification";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import AddProjectForm from "./components/AddProjectForm";
import AppearanceSection from "./components/AppearanceSection";
import BackupSection from "./components/BackupSection";
import DangerZoneSection from "./components/DangerZoneSection";
import EmissionsSummarySection from "./components/EmissionsSummarySection";
import FieldVisibilitySection from "./components/FieldVisibilitySection";
import MapCacheSection from "./components/MapCacheSection";
import LocalSyncSection from "./components/LocalSyncSection";
import PhotoRequirementsSection from "./components/PhotoRequirementsSection";
import ProjectIntegritySection from "./components/ProjectIntegritySection";
import ProjectList from "./components/ProjectList";
import ImportExportDialogs from "./components/ImportExportDialogs";
import ProjectManagementDialogs from "./components/ProjectManagementDialogs";
import { useSettingsPage } from "./hooks/useSettingsPage";
import s from "./Settings.module.scss";

export default function Settings(props) {
  const {
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
  } = useSettingsPage(props);
  const { data = [], onBack, setPage } = props;

  return (
    <div className={s.settings}>
      <PageHeader
        title={localeTexts.title}
        onBack={onBack ?? (() => setPage?.(""))}
        backLabel={t("settings.back")}
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
            onChangeSyncId={handleChangeSyncId}
          />

          {projects.length === 0 && !addingProject && (
            <p className={s.empty}>{localeTexts.noProjects}</p>
          )}
        </section>

        <AppearanceSection
          localeTexts={localeTexts}
          onToggleLanguage={toggleLanguage}
        />

        {activeProject && data.length > 0 && (
          <EmissionsSummarySection data={data} />
        )}

        <FieldVisibilitySection
          activeProject={activeProject}
          hiddenFields={hiddenFields}
          localeTexts={localeTexts}
          exportMode={monitoringExportMode}
          onConfigure={() => setFieldsModalOpen(true)}
          onExportModeChange={(nextMode) => {
            setMonitoringExportMode(nextMode);
            notify("success", localeTexts.notifications.excelExportModeSaved);
          }}
        />

        <PhotoRequirementsSection
          activeProject={activeProject}
          leakPhotoRequired={leakPhotoRequired}
          monitoringPhotoRequired={monitoringPhotoRequired}
          onLeakPhotoRequiredChange={(required) => {
            setLeakPhotoRequired(required);
            notify("success", t("settings.leakPhotoRequirementSaved"));
          }}
          onMonitoringPhotoRequiredChange={(required) => {
            setMonitoringPhotoRequired(required);
            setIntegrityReport(null);
            notify("success", t("settings.monitoringPhotoRequirementSaved"));
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

        <LocalSyncSection sync={localSync} lang={lang} />

        <ProjectIntegritySection
          activeProject={activeProject}
          report={integrityReport}
          checking={checkingIntegrity}
          onCheck={handleCheckIntegrity}
        />

        <MapCacheSection
          cacheInfo={cacheInfo}
          localeTexts={localeTexts}
          onClear={handleClearMapCache}
        />

        <DangerZoneSection
          activeProject={activeProject}
          localeTexts={localeTexts}
          onClearDatabase={handleClearDatabase}
        />
      </div>

      <ConfirmSheet
        open={Boolean(settingsConfirmTexts)}
        title={settingsConfirmTexts?.title}
        description={settingsConfirmTexts?.description}
        confirmLabel={settingsConfirmTexts?.confirmLabel}
        cancelLabel={t("settings.cancel")}
        onConfirm={handleSettingsConfirm}
        onCancel={() => setSettingsConfirmAction(null)}
      />

      <ImportExportDialogs
        backupConflict={{
          state: conflictState,
          onOverwrite: handleConflictOverwrite,
          onMerge: handleConflictMerge,
          onCopy: handleConflictCopy,
          onCancel: () => setConflictState({ open: false }),
        }}
        excelConflict={{
          state: excelConflictState,
          onOverwrite: handleExcelConflictOverwrite,
          onMerge: handleExcelConflictMerge,
          onCopy: handleExcelConflictCopy,
          onCancel: () => setExcelConflictState({ open: false }),
        }}
        excelImport={{
          state: excelImportState,
          onConfirm: confirmExcelImport,
          onCancel: cancelExcelImport,
        }}
        importConfirm={{
          state: importConfirmState,
          onConfirm: confirmImport,
          onCancel: cancelImport,
        }}
      />

      <ProjectManagementDialogs
        switchState={{
          state: projectSwitchState,
          onConfirm: confirmProjectSwitch,
          onCancel: cancelProjectSwitch,
        }}
        syncIdEditor={{
          state: syncIdEditorState,
          onChange: updateSyncIdEditorValue,
          onConfirm: confirmSyncIdEditor,
          onCancel: cancelSyncIdEditor,
        }}
      />

      {activeProject && (
        <>
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
        </>
      )}
    </div>
  );
}
