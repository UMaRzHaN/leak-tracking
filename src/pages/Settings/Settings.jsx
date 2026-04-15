import { useState, useCallback } from "react";
import { useProject } from "../../app/settings/ProjectContext";
import { useProjectVars } from "../../app/settings/useProjectVars";
import { PROJECT_META } from "../../configs/projects";
import SettingsHeader from "./Header/SettingsHeader";
import SettingsModal from "../../components/SettingsModal/SettingsModal";
import Notification from "../../components/Notification/Notification";
import ProjectList from "./components/ProjectList";
import AddProjectForm from "./components/AddProjectForm";
import s from "./Settings.module.scss";

export default function Settings({ setPage, clearForm, clearVoiceData }) {
  const {
    projects,
    activeProject,
    addProject,
    selectProject,
    renameProject,
    changeProjectType,
    removeProject,
  } = useProject();

  const { vars, setVars } = useProjectVars(activeProject?.id ?? null);

  const [notification, setNotification] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [addingProject, setAddingProject] = useState(false);

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

  const handleTypeChange = useCallback(
    (id, type) => {
      changeProjectType(id, type);
      notify("success", "Тип проекта изменён");
    },
    [changeProjectType, notify],
  );

  const handleRemove = useCallback(
    (id) => {
      const target = projects.find((p) => p.id === id);
      if (!target) return;

      const ok = window.confirm(
        `Удалить проект «${target.name}»?\n\nДанные в приложении будут скрыты, но файлы на устройстве останутся.`,
      );
      if (!ok) return;

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
              onConfirm={handleAdd}
              onCancel={() => setAddingProject(false)}
            />
          )}

          <ProjectList
            projects={projects}
            activeId={activeProject?.id}
            onSelect={handleSelect}
            onRename={handleRename}
            onTypeChange={handleTypeChange}
            onRemove={handleRemove}
          />

          {projects.length === 0 && !addingProject && (
            <p className={s.empty}>Нет проектов. Создайте первый.</p>
          )}
        </section>

        {/* ── Параметры расчёта ── */}
        {activeProject && (
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Параметры расчёта</h2>
            <p className={s.description}>
              Для проекта <strong>{activeProject.name}</strong>
            </p>
            <button
              className={s.editVarsBtn}
              type="button"
              onClick={() => setModalOpen(true)}
            >
              ⚙ Редактировать параметры
            </button>
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
