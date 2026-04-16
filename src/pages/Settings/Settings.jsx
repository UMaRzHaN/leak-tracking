import { useState, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { useProject } from "../../app/settings/ProjectContext";
import { useProjectVars } from "../../app/settings/useProjectVars";
import { useProjectData } from "../../app/hooks/useProjectData";
import { PROJECT_META } from "../../configs/projects";
import SettingsHeader from "./Header/SettingsHeader";
import SettingsModal from "../../components/SettingsModal/SettingsModal";
import Notification from "../../components/Notification/Notification";
import ProjectList from "./components/ProjectList";
import AddProjectForm from "./components/AddProjectForm";
import s from "./Settings.module.scss";

export default function Settings({ setPage, clearForm, clearVoiceData, clearDatabase }) {
  const {
    projects,
    activeProject,
    addProject,
    selectProject,
    renameProject,
    removeProject,
  } = useProject();

  const { vars, setVars } = useProjectVars(activeProject?.id ?? null);
  const { data, save } = useProjectData();

  const [notification, setNotification] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const importInputRef = useRef(null);

  const notify = useCallback((type, message) => setNotification({ type, message }), []);

  /* =========================
     PROJECT ACTIONS
  ========================= */
  const handleSelect = useCallback(
    (id) => {
      if (id === activeProject?.id) return;

      const ok = window.confirm(
        "Переключить проект? Форма добавления утечки будет сброшена.",
      );
      if (!ok) return;

      selectProject(id);
      clearForm?.();
      clearVoiceData?.();
      notify("info", "Проект переключён");
    },
    [activeProject, selectProject, clearForm, clearVoiceData, notify],
  );

  const handleRename = useCallback(
    (id, name) => {
      renameProject(id, name);
      notify("success", "Название сохранено");
    },
    [renameProject, notify],
  );

  const handleRemove = useCallback(
    (id) => {
      const target = projects.find((p) => p.id === id);
      if (!target) return;
      removeProject(id);
      notify("warning", `Проект «${target.name}» удалён`);
    },
    [projects, removeProject, notify],
  );

  const handleAdd = useCallback(
    (name, type) => {
      addProject(name, type);
      setAddingProject(false);
      notify("success", `Проект «${name || PROJECT_META[type].title}» создан`);
    },
    [addProject, notify],
  );

  /* =========================
     BACKUP / RESTORE
  ========================= */
  const handleExport = useCallback(async () => {
    if (!data.length) { notify("warning", "Нет данных для экспорта"); return; }

    const name = activeProject?.folderName ?? "backup";
    const fileName = `${name}_${Date.now()}.json`;
    const json = JSON.stringify(data, null, 2);

    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.writeFile({
          path: fileName,
          directory: Directory.Documents,
          data: json,
          encoding: "utf8",
        });
        notify("success", `Сохранено в Документы: ${fileName}`);
      } catch (err) {
        notify("error", "Ошибка экспорта: " + err.message);
      }
    } else {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      notify("success", `Экспортировано ${data.length} записей`);
    }
  }, [data, activeProject, notify]);

  const handleImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed)) throw new Error("Ожидается массив JSON");
        const ok = window.confirm(
          `Импортировать ${parsed.length} записей?\n\nТекущие данные будут заменены.`,
        );
        if (!ok) return;
        await save(parsed);
        notify("success", `Импортировано ${parsed.length} записей`);
      } catch (err) {
        notify("error", "Ошибка импорта: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  }, [save, notify]);

  /* =========================
     VARS MODAL
  ========================= */
  const handleModalSave = useCallback(
    (nextVars) => {
      setVars(nextVars);
      setModalOpen(false);
      notify("success", "Параметры расчёта сохранены");
    },
    [setVars, notify],
  );

  const handleModalClose = useCallback((discarded) => {
    setModalOpen(false);
    if (discarded) notify("warning", "Изменения отменены");
  }, [notify]);

  const handleClearDatabase = useCallback(() => {
    const ok = window.confirm(
      "Удалить все записи об утечках?\n\nЭто действие необратимо. Фото-файлы сохранятся на устройстве.",
    );
    if (!ok) return;
    clearDatabase?.();
    notify("warning", "База данных очищена");
  }, [clearDatabase, notify]);

  /* =========================
     RENDER
  ========================= */
  return (
    <div className={s.settings}>
      <SettingsHeader onBack={() => setPage?.("")} />

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
              <button className={s.addBtn} type="button" onClick={() => setAddingProject(true)}>
                + Добавить
              </button>
            )}
          </div>

          {addingProject && (
            <AddProjectForm
              onConfirm={handleAdd}
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
                <button className={s.backupBtn} type="button" onClick={handleExport}>
                  ⬆ Экспорт JSON
                </button>
                <button
                  className={`${s.backupBtn} ${s.restore}`}
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                >
                  ⬇ Импорт JSON
                </button>
              </div>
              <p className={s.backupHint}>
                Экспорт сохраняет записи активного проекта в файл. Импорт заменяет текущие данные.
              </p>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleImport}
            />
          </section>
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

        {/* ── Опасная зона ── */}
        {activeProject && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Опасная зона</h2>
            </div>
            <div className={s.dangerBody}>
              <p className={s.dangerHint}>
                Очистка удаляет все записи об утечках активного проекта. Фото-файлы на устройстве сохранятся.
              </p>
              <button className={s.dangerBtn} type="button" onClick={handleClearDatabase}>
                🗑 Очистить базу данных
              </button>
            </div>
          </section>
        )}

      </div>

      {activeProject && vars && (
        <SettingsModal
          open={modalOpen}
          onClose={handleModalClose}
          variables={vars}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
}
