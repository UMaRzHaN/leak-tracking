import { useState, useCallback, useEffect, useMemo } from "react";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { useProjectData } from "@/app/hooks/useProjectData";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useTheme } from "@/app/hooks/useTheme";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { useHiddenFields } from "@/app/project/hooks/useHiddenFields";
import { useLanguage } from "@/app/hooks/useLanguage";
import { getMapCacheInfo, clearMapCache } from "@/services/maps/tileCache";
import PageHeader from "@/components/layout/PageHeader/PageHeader";
import SettingsModal from "@/features/settings/SettingsModal/SettingsModal";
import FieldVisibilityModal from "@/features/fieldVisibility/FieldVisibilityModal/FieldVisibilityModal";
import Notification from "@/components/ui/Notification/Notification";
import ProjectList from "./components/ProjectList";
import AddProjectForm from "./components/AddProjectForm";
import EmissionsSummarySection from "./components/EmissionsSummarySection";
import { useProjectActions } from "./hooks/useProjectActions";
import { useBackupActions } from "./hooks/useBackupActions";
import ImportConflictSheet from "@/features/importConflict/ImportConflictSheet";
import s from "./Settings.module.scss";

export default function Settings({
  setPage,
  prevPage,
  clearDatabase,
  onImportZip,
  onImportIntoExisting,
}) {
  const { lang, t, toggleLanguage } = useLanguage();
  const localeTexts = useMemo(
    () => ({
      title: t("settings.title"),
      appearanceTitle: t("settings.appearanceTitle"),
      themeLabelLight: t("settings.themeLabelLight"),
      themeLabelDark: t("settings.themeLabelDark"),
      themeHintLight: t("settings.themeHintLight"),
      themeHintDark: t("settings.themeHintDark"),

      languageLabel: t("settings.languageLabel"),
      languageHintRu: t("settings.languageHintRu"),
      languageHintEn: t("settings.languageHintEn"),
      toggleButtonRu: t("settings.toggleButtonRu"),
      toggleButtonEn: t("settings.toggleButtonEn"),

      projects: t("settings.projects"),
      addProject: t("settings.addProject"),
      noProjects: t("settings.noProjects"),

      calculationParameters: t("settings.calculationParameters"),
      projectSettings: t("settings.projectSettings"),
      editParameters: t("settings.editParameters"),

      fieldsAndExcel: t("settings.fieldsAndExcel"),
      fieldsDescription: t("settings.fieldsDescription"),
      hiddenFields: t("settings.hiddenFields"),
      configureFields: t("settings.configureFields"),

      backup: t("settings.backup"),
      exportZip: t("settings.exportZip"),
      importZip: t("settings.importZip"),
      backupHint: t("settings.backupHint"),

      mapCache: t("settings.mapCache"),
      satelliteTiles: t("settings.satelliteTiles"),
      cacheEmpty: t("settings.cacheEmpty"),
      loading: t("settings.loading"),
      clearMapCache: t("settings.clearMapCache"),

      dangerZone: t("settings.dangerZone"),
      dangerHint: t("settings.dangerHint"),
      clearDatabase: t("settings.clearDatabase"),

      notifications: {
        parametersSaved: t("settings.notifications.parametersSaved"),
        changesCanceled: t("settings.notifications.changesCanceled"),
        cacheCleared: t("settings.notifications.cacheCleared"),
        databaseCleared: t("settings.notifications.databaseCleared"),
        allFieldsActive: t("settings.notifications.allFieldsActive"),
        hiddenFieldsCount: t("settings.notifications.hiddenFieldsCount"),
      },

      dialogs: {
        clearMapCache: t("settings.dialogs.clearMapCache"),
        clearDatabase: t("settings.dialogs.clearDatabase"),
      },
    }),
    [t],
  );
  const [notification, setNotification] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [fieldsModalOpen, setFieldsModalOpen] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);

  const notify = useCallback(
    (type, message) => setNotification({ type, message }),
    [],
  );

  useEffect(() => {
    getMapCacheInfo()
      .then(setCacheInfo)
      .catch(() => setCacheInfo({ count: 0, sizeMB: 0 }));
  }, []);

  const {
    projects,
    activeProject,
    handleSelect,
    handleRename,
    handleRemove,
    handleAdd,
  } = useProjectActions({ setCacheInfo, notify });

  const { vars, setVars } = useProjectVars(activeProject?.id ?? null);
  const { data } = useProjectData();
  const { getPhoto: idbGetPhoto } = usePhotoStorage();
  const projectConfig = useProjectConfig();
  const { hiddenFields, setHiddenFields } = useHiddenFields(
    activeProject?.id ?? null,
  );
  const { dark, toggle: toggleTheme } = useTheme();

  const {
    importZipRef,
    handleExportZip,
    handleImportZip,
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

  const handleModalSave = useCallback(
    (nextVars) => {
      setVars(nextVars);
      setModalOpen(false);
      notify("success", "Параметры расчёта сохранены");
    },
    [setVars, notify],
  );

  const handleModalClose = useCallback(
    (discarded) => {
      setModalOpen(false);
      if (discarded) notify("warning", "Изменения отменены");
    },
    [notify],
  );

  const handleClearMapCache = useCallback(async () => {
    const ok = window.confirm(
      "Очистить кэш карты? Тайлы будут перекачаны при следующем открытии карты.",
    );
    if (!ok) return;
    await clearMapCache();
    setCacheInfo({ count: 0, sizeMB: 0 });
    notify("success", "Кэш карты очищен");
  }, [notify]);

  const handleClearDatabase = useCallback(() => {
    const ok = window.confirm(
      "Удалить все записи об утечках?\n\nЭто действие необратимо. Фото-файлы сохранятся на устройстве.",
    );
    if (!ok) return;
    clearDatabase?.();
    notify("warning", "База данных очищена");
  }, [clearDatabase, notify]);

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
        {/* ── Список проектов ── */}
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
        {/* ── Параметры расчёта ── */}
        {activeProject && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>
                {localeTexts.calculationParameters}
              </h2>
            </div>
            <div className={s.calcBody}>
              <p className={s.description}>
                {localeTexts.projectSettings}{" "}
                <strong>{activeProject.name}</strong>
              </p>
              <button
                className={s.editVarsBtn}
                type="button"
                onClick={() => setModalOpen(true)}
              >
                ⚙ {localeTexts.editParameters}
              </button>
            </div>
          </section>
        )}
        {/* ── Внешний вид ── */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>{localeTexts.appearanceTitle}</h2>
          </div>
          <div className={s.themeRow}>
            <div className={s.themeInfo}>
              <span className={s.themeLabel}>
                {dark
                  ? localeTexts.themeLabelDark
                  : localeTexts.themeLabelLight}
              </span>
              <span className={s.themeHint}>
                {dark ? localeTexts.themeHintDark : localeTexts.themeHintLight}
              </span>
            </div>
            <button
              className={`${s.themeToggle} ${dark ? s.themeToggleDark : ""}`}
              type="button"
              onClick={toggleTheme}
              aria-label="Переключить тему"
            >
              <span className={s.themeThumb} />
            </button>
          </div>
          <div className={s.themeRow}>
            <div className={s.themeInfo}>
              <span className={s.themeLabel}>{localeTexts.languageLabel}</span>
              <span className={s.themeHint}>
                {lang === "ru"
                  ? localeTexts.languageHintRu
                  : localeTexts.languageHintEn}
              </span>
            </div>
            <button
              className={s.languageToggle}
              type="button"
              onClick={toggleLanguage}
              aria-label="Переключить язык"
            >
              {lang === "ru"
                ? localeTexts.toggleButtonEn
                : localeTexts.toggleButtonRu}
            </button>
          </div>
        </section>
        {/* ── Суммарные потери по проекту ── */}
        {activeProject && data.length > 0 && (
          <EmissionsSummarySection data={data} />
        )}
        {/* ── Настройка полей формы ── */}
        {activeProject && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>{localeTexts.fieldsAndExcel}</h2>
            </div>
            <div className={s.calcBody}>
              <p className={s.description}>
                {localeTexts.fieldsDescription}
                {hiddenFields.size > 0 && (
                  <strong> Скрыто: {hiddenFields.size}.</strong>
                )}
              </p>
              <button
                className={s.editVarsBtn}
                type="button"
                onClick={() => setFieldsModalOpen(true)}
              >
                ☰ {localeTexts.configureFields}
              </button>
            </div>
          </section>
        )}
        {/* ── Резервное копирование ── */}
        {activeProject && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>{localeTexts.backup}</h2>
            </div>
            <div className={s.backupBody}>
              <div className={s.backupRow}>
                <button
                  className={s.backupBtn}
                  type="button"
                  onClick={handleExportZip}
                >
                  ⬆ {localeTexts.exportZip}
                </button>
                <button
                  className={`${s.backupBtn} ${s.restore}`}
                  type="button"
                  onClick={() => importZipRef.current?.click()}
                >
                  ⬇ {localeTexts.importZip}
                </button>
              </div>
              <p className={s.backupHint}>{localeTexts.backupHint}</p>
            </div>
            <input
              ref={importZipRef}
              type="file"
              accept=".zip,application/zip"
              style={{ display: "none" }}
              onChange={handleImportZip}
            />
          </section>
        )}

        {/* ── Кэш карты ── */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>{localeTexts.mapCache}</h2>
          </div>
          <div className={s.cacheBody}>
            <div className={s.cacheInfo}>
              <span className={s.cacheLabel}>{localeTexts.satelliteTiles}</span>
              {cacheInfo ? (
                <span className={s.cacheSize}>
                  {cacheInfo.count > 0
                    ? `${cacheInfo.count} тайлов · ~${cacheInfo.sizeMB} МБ`
                    : `${localeTexts.cacheEmpty}`}
                </span>
              ) : (
                <span className={s.cacheSize}>{localeTexts.loading}</span>
              )}
            </div>
            <button
              className={s.cacheBtn}
              type="button"
              onClick={handleClearMapCache}
              disabled={!cacheInfo || cacheInfo.count === 0}
            >
              🗺 {localeTexts.clearMapCache}
            </button>
          </div>
        </section>

        {/* ── Опасная зона ── */}
        {activeProject && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>{localeTexts.dangerZone}</h2>
            </div>
            <div className={s.dangerBody}>
              <p className={s.dangerHint}>{localeTexts.dangerHint}</p>
              <button
                className={s.dangerBtn}
                type="button"
                onClick={handleClearDatabase}
              >
                🗑 {localeTexts.clearDatabase}
              </button>
            </div>
          </section>
        )}
      </div>

      <ImportConflictSheet
        open={conflictState.open}
        projectName={conflictState.resolvedName}
        existingProject={conflictState.existingProject}
        leakCount={conflictState.leakCount}
        onOverwrite={handleConflictOverwrite}
        onMerge={handleConflictMerge}
        onCopy={handleConflictCopy}
        onCancel={() => setConflictState({ open: false })}
      />

      {activeProject && vars && (
        <SettingsModal
          open={modalOpen}
          onClose={handleModalClose}
          variables={vars}
          onSave={handleModalSave}
        />
      )}

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
                ? `Скрыто полей: ${next.size}`
                : `${localeTexts.allFieldsActive}`,
            );
          }}
        />
      )}
    </div>
  );
}
