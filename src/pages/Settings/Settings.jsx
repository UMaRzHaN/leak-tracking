import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon/Icon";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { getLocationLevelKeys } from "@/utils/locationTree";
import { listProjectObjects } from "./projectObjects";
import ObjectsScreen from "./components/ObjectsScreen";
import PageHeader from "@/components/layout/PageHeader/PageHeader";
import LeakFieldsModal from "./components/LeakFieldsModal";
import Notification from "@/components/ui/Notification/Notification";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import SettingsDialogs from "./components/SettingsDialogs";
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
import ImportSection from "./components/ImportSection";
import { useSettingsPage } from "./hooks/useSettingsPage";
import s from "./Settings.module.scss";
import { hasComponentRegistry } from "@/configs/componentRegistry.config";
import ComponentFieldsModal from "./components/ComponentFieldsModal";
import { useComponentFieldVisibility } from "./hooks/useComponentFieldVisibility";

export default function Settings(props) {
  const page = useSettingsPage(props);
  const {
    activeProject,
    addingProject,
    cacheInfo,
    checkingIntegrity,
    fieldsModalOpen,
    handleAdd,
    handleChangeSyncId,
    handleCheckIntegrity,
    handleClearDatabase,
    handleClearMapCache,
    handleExportZip,
    handleImportFile,
    handleRemove,
    handleRename,
    handleSelect,
    handleSettingsConfirm,
    hiddenFields,
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
    setAddingProject,
    setFieldsModalOpen,
    setHiddenFields,
    setIntegrityReport,
    setMonitoringExportMode,
    setLeakPhotoRequired,
    setMonitoringPhotoRequired,
    setNotification,
    setSettingsConfirmAction,
    settingsConfirmTexts,
    t,
    toggleLanguage,
    setVoiceCorrections,
    voiceCorrections,
  } = page;
  const {
    data = [],
    onBack,
    setPage,
    focusSection = null,
    // «import» — экран импорта из меню (9a): те же обработчики и диалоги
    // настроек, но на экране только импорт и синхронизация.
    view = "settings",
  } = props;
  const contentRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const [objectsOpen, setObjectsOpen] = useState(false);
  // Объекты и кусты (11c) — по тем же уровням места, что выбор в шапке.
  const objects = useMemo(
    () =>
      listProjectObjects(
        data,
        getLocationLevelKeys(PROJECT_LOCATION_CONFIG[activeProject?.type]),
      ),
    [data, activeProject?.type],
  );

  // Меню приложения ведёт сразу в раздел — импорт, синхронизацию, список
  // проектов, — а не в начало длинной страницы.
  useEffect(() => {
    if (!focusSection) return;
    contentRef.current
      ?.querySelector(`[data-settings-section="${focusSection}"]`)
      ?.scrollIntoView?.({ block: "start" });
  }, [focusSection]);
  const componentFields = useComponentFieldVisibility(activeProject);

  return (
    <div className={s.settings}>
      <PageHeader
        title={view === "import" ? t("importScreen.title") : localeTexts.title}
        onBack={onBack ?? (() => setPage?.(""))}
        backLabel={t("settings.back")}
      />

      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      {view === "import" ? (
        <div className={s.content}>
          <ImportSection
            importRef={importZipRef}
            busy={isImportingExcel}
            onImport={handleImportFile}
          />
          {localSync.available && (
            <>
              <h2 className={s.groupCaption}>{t("importScreen.other")}</h2>
              <LocalSyncSection sync={localSync} />
            </>
          )}
        </div>
      ) : (
        <div className={s.content} ref={contentRef}>
          {activeProject && (
            <div className={s.importScreen}>
              <h2 className={s.groupCaption}>{t("settings.objects.group")}</h2>
              <div className={s.groupCard}>
                <div className={s.groupRow}>
                  <span className={s.groupRowText}>
                    <strong>{t("settings.objects.name")}</strong>
                  </span>
                  <span className={s.objectsCount}>{activeProject.name}</span>
                </div>
                <button
                  type="button"
                  className={`${s.groupRow} ${s.groupRowButton}`}
                  onClick={() => setObjectsOpen(true)}
                >
                  <span className={s.groupRowText}>
                    <strong>{t("settings.objects.title")}</strong>
                  </span>
                  <span className={s.objectsCount}>
                    {t("settings.objects.count", { count: objects.length })}
                  </span>
                  <Icon name="chevronRight" size={16} strokeWidth={2} />
                </button>
              </div>
            </div>
          )}

          <section className={s.section} data-settings-section="projects">
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
      )}

      <SettingsDialogs page={page} />

      {objectsOpen && (
        <ObjectsScreen
          objects={objects}
          onClose={() => setObjectsOpen(false)}
        />
      )}

      <ConfirmSheet
        open={Boolean(settingsConfirmTexts)}
        title={settingsConfirmTexts?.title}
        description={settingsConfirmTexts?.description}
        confirmLabel={settingsConfirmTexts?.confirmLabel}
        cancelLabel={t("settings.cancel")}
        onConfirm={handleSettingsConfirm}
        onCancel={() => setSettingsConfirmAction(null)}
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
