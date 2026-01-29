import { useState, useMemo, useCallback, useEffect } from "react";
import { useProject } from "../../app/settings/ProjectContext";
import { useProjectVars } from "../../app/settings/useProjectVars";
import { PROJECT_META } from "../../configs/projects";
import SettingsHeader from "./Header/SettingsHeader";
import SettingsFooter from "./Footer/SettingsFooter";
import SettingsModal from "../../components/SettingsModal/SettingsModal";
import s from "./Settings.module.scss";

export default function Settings({ setPage }) {
  const { project, changeProject } = useProject();

  const activeProject = PROJECT_META[project];

  const { vars, setVars } = useProjectVars(project);

  const [modalOpen, setModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  /* =========================
     PROJECTS
  ========================= */
  const projects = useMemo(() => Object.keys(PROJECT_META), []);

  /* =========================
     HANDLERS
  ========================= */
  const handleProjectChange = useCallback(
    (projectId) => {
      if (projectId === project) return;

      const ok = window.confirm(
        "При смене проекта будут использованы другие параметры расчёта. Продолжить?",
      );

      if (!ok) return;

      changeProject(projectId);

      requestAnimationFrame(() => {
        setPage?.("");
      });
    },
    [project, changeProject, setPage],
  );

  const handleModalSave = useCallback(
    (nextVars) => {
      setVars(nextVars);
      setModalOpen(false);
    },
    [setVars],
  );

  const handleModalClose = useCallback((discarded) => {
    setModalOpen(false);

    if (discarded) {
      setNotification({
        type: "warning",
        message: "Изменения отменены",
      });
    }
  }, []);

  /* =========================
     NOTIFICATION AUTO-CLOSE
  ========================= */
  useEffect(() => {
    if (!notification) return;

    const t = setTimeout(() => setNotification(null), 3000);
    return () => clearTimeout(t);
  }, [notification]);

  /* =========================
     GUARD
  ========================= */
  if (!activeProject) {
    return (
      <div className={s.settings}>
        <p>⚠️ Неизвестный проект</p>
      </div>
    );
  }

  if (!vars) {
    return (
      <div className={s.settings}>
        <p>⏳ Загрузка параметров…</p>
      </div>
    );
  }

  /* =========================
     RENDER
  ========================= */
  return (
    <div className={s.settings}>
      <SettingsHeader onBack={() => setPage?.("")} />

      {notification && (
        <div className={`${s.notification} ${s[notification.type]}`}>
          <span className={s.notificationIcon}>⚠️</span>
          <span className={s.notificationText}>{notification.message}</span>
          <button
            className={s.notificationClose}
            onClick={() => setNotification(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className={s.content}>
        <div className={s.settingsSection}>
          <h2>Выбор проекта</h2>

          <p>
            Текущий проект: <strong>{activeProject.title}</strong>
          </p>
          <p className={s.description}>{activeProject.description}</p>

          <div className={s.projectsList}>
            {projects.map((projectId) => {
              const meta = PROJECT_META[projectId];
              const isActive = project === projectId;

              return (
                <button
                  key={projectId}
                  onClick={() => handleProjectChange(projectId)}
                  className={`${s.projectButton} ${isActive ? s.active : ""}`}
                >
                  <div className={s.projectTitle}>{meta.title}</div>
                  <div className={s.projectDesc}>{meta.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <SettingsFooter onEditClick={() => setModalOpen(true)} />

      <SettingsModal
        open={modalOpen}
        onClose={handleModalClose}
        variables={vars}
        onSave={handleModalSave}
      />
    </div>
  );
}
