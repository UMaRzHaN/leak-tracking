import { useState, useCallback, useEffect } from "react";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { useProjectData } from "@/app/hooks/useProjectData";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useTheme } from "@/app/hooks/useTheme";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { useHiddenFields } from "@/app/project/hooks/useHiddenFields";
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
      <PageHeader title="Настройки" onBack={() => setPage?.(prevPage ?? "")} />

      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      <div className={s.content}>
        {/* ── Список проектов ── */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Проекты</h2>
            {!addingProject && (
              <button
                className={s.addBtn}
                type="button"
                onClick={() => setAddingProject(true)}
              >
                + Добавить
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
            <p className={s.empty}>Нет проектов. Создайте первый.</p>
          )}
        </section>

        {/* ── Резервное копирование ── */}
        {activeProject && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Резервная копия</h2>
            </div>
            <div className={s.backupBody}>
              <div className={s.backupRow}>
                <button
                  className={s.backupBtn}
                  type="button"
                  onClick={handleExportZip}
                >
                  ⬆ Экспорт ZIP
                </button>
                <button
                  className={`${s.backupBtn} ${s.restore}`}
                  type="button"
                  onClick={() => importZipRef.current?.click()}
                >
                  ⬇ Импорт ZIP
                </button>
              </div>
              <p className={s.backupHint}>
                ZIP-архив содержит все записи и фотографии. Рекомендуется для
                переноса данных между устройствами.
              </p>
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

        {/* ── Суммарные потери по проекту ── */}
        {activeProject && data.length > 0 && (
          <EmissionsSummarySection data={data} />
        )}

        {/* ── Параметры расчёта ── */}
        {activeProject && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Параметры расчёта</h2>
            </div>
            <div className={s.calcBody}>
              <p className={s.description}>
                Настройки для проекта <strong>{activeProject.name}</strong>
              </p>
              <button
                className={s.editVarsBtn}
                type="button"
                onClick={() => setModalOpen(true)}
              >
                ⚙ Редактировать параметры
              </button>
            </div>
          </section>
        )}

        {/* ── Настройка полей формы ── */}
        {activeProject && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Поля формы и Excel</h2>
            </div>
            <div className={s.calcBody}>
              <p className={s.description}>
                Скройте неиспользуемые поля — они исчезнут из формы и столбцов
                экспорта.
                {hiddenFields.size > 0 && (
                  <strong> Скрыто: {hiddenFields.size}.</strong>
                )}
              </p>
              <button
                className={s.editVarsBtn}
                type="button"
                onClick={() => setFieldsModalOpen(true)}
              >
                ☰ Настроить поля
              </button>
            </div>
          </section>
        )}

        {/* ── Внешний вид ── */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Внешний вид</h2>
          </div>
          <div className={s.themeRow}>
            <div className={s.themeInfo}>
              <span className={s.themeLabel}>
                {dark ? "Тёмная тема" : "Светлая тема"}
              </span>
              <span className={s.themeHint}>
                {dark ? "Тёмный фон, снижает нагрузку на глаза" : "Светлый фон"}
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
        </section>

        {/* ── Кэш карты ── */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Кэш карты</h2>
          </div>
          <div className={s.cacheBody}>
            <div className={s.cacheInfo}>
              <span className={s.cacheLabel}>Спутниковые тайлы</span>
              {cacheInfo ? (
                <span className={s.cacheSize}>
                  {cacheInfo.count > 0
                    ? `${cacheInfo.count} тайлов · ~${cacheInfo.sizeMB} МБ`
                    : "Кэш пуст"}
                </span>
              ) : (
                <span className={s.cacheSize}>Загрузка...</span>
              )}
            </div>
            <button
              className={s.cacheBtn}
              type="button"
              onClick={handleClearMapCache}
              disabled={!cacheInfo || cacheInfo.count === 0}
            >
              🗺 Очистить кэш карты
            </button>
          </div>
        </section>

        {/* ── Опасная зона ── */}
        {activeProject && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Опасная зона</h2>
            </div>
            <div className={s.dangerBody}>
              <p className={s.dangerHint}>
                Очистка удаляет все записи об утечках активного проекта.
                Фото-файлы на устройстве сохранятся.
              </p>
              <button
                className={s.dangerBtn}
                type="button"
                onClick={handleClearDatabase}
              >
                🗑 Очистить базу данных
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
              next.size > 0 ? `Скрыто полей: ${next.size}` : "Все поля активны",
            );
          }}
        />
      )}
    </div>
  );
}
