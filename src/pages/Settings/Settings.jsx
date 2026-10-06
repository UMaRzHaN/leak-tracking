import { useEffect, useMemo, useRef, useState } from "react";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { getLocationLevelKeys } from "@/utils/locationTree";
import { listProjectObjects } from "./projectObjects";
import ObjectsScreen from "./components/ObjectsScreen";
import PageHeader from "@/components/layout/PageHeader/PageHeader";
import LeakFieldsModal from "./components/LeakFieldsModal";
import Notification from "@/components/ui/Notification/Notification";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import SettingsDialogs from "./components/SettingsDialogs";
import ActiveProjectCard from "./components/ActiveProjectCard";
import AppearanceSection from "./components/AppearanceSection";
import DangerZoneSection from "./components/DangerZoneSection";
import MonitoringRoundsSection from "./components/MonitoringRoundsSection";
import { useAllowNewRounds } from "@/app/project/hooks/useAllowNewRounds";
import EmissionsSummarySection from "./components/EmissionsSummarySection";
import FieldVisibilitySection from "./components/FieldVisibilitySection";
import MapCacheSection from "./components/MapCacheSection";
import LocalSyncSection from "./components/LocalSyncSection";
import PhotoRequirementsSection from "./components/PhotoRequirementsSection";
import VoiceCorrectionsSection from "./components/VoiceCorrectionsSection";
import ProjectIntegritySection from "./components/ProjectIntegritySection";
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
    cacheInfo,
    checkingIntegrity,
    fieldsModalOpen,
    handleChangeSyncId,
    handleCheckIntegrity,
    handleClearDatabase,
    handleClearMapCache,
    handleImportFile,
    handleRemove,
    handleRename,
    handleSettingsConfirm,
    hiddenFields,
    importZipRef,
    integrityReport,
    isImportingExcel,
    leakPhotoRequired,
    componentPhotoRequired,
    setComponentPhotoRequired,
    localSync,
    localeTexts,
    monitoringPhotoRequired,
    notification,
    notify,
    projectConfig,
    setFieldsModalOpen,
    setHiddenFields,
    setIntegrityReport,
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
  const [allowNewRounds, setAllowNewRounds] = useAllowNewRounds(
    activeProject?.id ?? null,
  );
  // Удаление проекта — в опасной зоне, с подтверждением, как очистка базы.
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
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
          {activeProject ? (
            <div className={s.importScreen}>
              <h2 className={s.groupCaption}>{t("settings.objects.group")}</h2>
              <ActiveProjectCard
                project={activeProject}
                objectsCount={objects.length}
                onOpenObjects={() => setObjectsOpen(true)}
                onRename={(name) => handleRename(activeProject.id, name)}
                onChangeSyncId={() =>
                  handleChangeSyncId(activeProject.id, activeProject.syncId)
                }
              />
            </div>
          ) : (
            <p className={s.empty}>{localeTexts.noProjects}</p>
          )}

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
            onConfigure={() => setFieldsModalOpen(true)}
            registry={componentFields.column}
          />

          <MonitoringRoundsSection
            activeProject={activeProject}
            allowNewRounds={allowNewRounds}
            onChange={(allow) => {
              setAllowNewRounds(allow);
              notify("success", t("settings.rounds.saved"));
            }}
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
            onRemoveProject={() => setRemoveConfirmOpen(true)}
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
        open={removeConfirmOpen && Boolean(activeProject)}
        title={t("settings.deleteProjectTitle", { name: activeProject?.name })}
        description={t("settings.deleteProjectDescription")}
        confirmLabel={t("settings.deleteProject")}
        cancelLabel={t("settings.cancel")}
        onConfirm={() => {
          setRemoveConfirmOpen(false);
          if (activeProject) handleRemove(activeProject.id);
        }}
        onCancel={() => setRemoveConfirmOpen(false)}
      />

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
