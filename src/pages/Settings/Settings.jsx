import PageHeader from "@/components/layout/PageHeader/PageHeader";
import LeakFieldsModal from "./components/LeakFieldsModal";
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
import VoiceCorrectionsSection from "./components/VoiceCorrectionsSection";
import ProjectIntegritySection from "./components/ProjectIntegritySection";
import ProjectList from "./components/ProjectList";
import ImportExportDialogs from "./components/ImportExportDialogs";
import ProjectManagementDialogs from "./components/ProjectManagementDialogs";
import { useSettingsPage } from "./hooks/useSettingsPage";
import s from "./Settings.module.scss";
import { hasComponentRegistry } from "@/configs/componentRegistry.config";
import ComponentFieldsModal from "./components/ComponentFieldsModal";
import { useComponentFieldVisibility } from "./hooks/useComponentFieldVisibility";

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
    handleImportFile,
    handleRemove,
    handleRename,
    handleSelect,
    handleSettingsConfirm,
    hiddenFields,
    importConfirmState,
    importZipRef,
    integrityReport,
    isExportingZip,
    isImportingExcel,
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
    setVoiceCorrections,
    updateSyncIdEditorValue,
    voiceCorrections,
  } = useSettingsPage(props);
  const { data = [], onBack, setPage } = props;
  const componentFields = useComponentFieldVisibility(activeProject);

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
          registry={componentFields.column}
        />

        <PhotoRequirementsSection
          activeProject={activeProject}
          leakPhotoRequired={leakPhotoRequired}
          monitoringPhotoRequired={monitoringPhotoRequired}
          componentPhotoRequired={componentPhotoRequired}
          hasComponentRegistry={hasComponentRegistry(activeProject)}
          onComponentPhotoRequiredChange={(required) => {
            setComponentPhotoRequired(required);
            notify("success", t("settings.componentPhotoRequirementSaved"));
          }}
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

        <VoiceCorrectionsSection
          activeProject={activeProject}
          corrections={voiceCorrections}
          onSave={(next) => {
            setVoiceCorrections(next);
            notify("success", t("settings.voice.saved"));
          }}
        />

        <BackupSection
          activeProject={activeProject}
          importRef={importZipRef}
          isExporting={isExportingZip}
          isImportingExcel={isImportingExcel}
          localeTexts={localeTexts}
          onExport={handleExportZip}
          onImport={handleImportFile}
        />

        <LocalSyncSection sync={localSync} />

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

      {componentFields.available && (
        <ComponentFieldsModal
          {...componentFields.modal}
          localeTexts={localeTexts}
          notify={notify}
        />
      )}

      {activeProject && (
        <LeakFieldsModal
          open={fieldsModalOpen}
          onClose={() => setFieldsModalOpen(false)}
          config={projectConfig}
          hiddenFields={hiddenFields}
          setHiddenFields={setHiddenFields}
          localeTexts={localeTexts}
          notify={notify}
        />
      )}
    </div>
  );
}
