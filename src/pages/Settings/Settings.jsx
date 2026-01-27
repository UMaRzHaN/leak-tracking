import { useState, useMemo } from "react";
import { useProject } from "../../app/settings/ProjectContext";
import { useProjectVars } from "../../app/settings/useProjectVars";
import { PROJECT_META } from "../../configs/projects";
import SettingsHeader from "./Header/SettingsHeader";
import SettingsFooter from "./Footer/SettingsFooter";
import SettingsModal from "../../components/SettingsModal/SettingsModal";
import * as variables from "../../data/variables";
import s from "./Settings.module.scss";

/* =========================
   DEFAULT VARS
========================= */

export default function Settings({ setPage }) {
  const { project, changeProject } = useProject();
  const defaultVars = {
    gasType: variables.gasType,
    density: variables.density,
    percentage_gas_to_flare: variables.percentage_gas_to_flare,
    percentage_gas_to_utilization: 100 - variables.percentage_gas_to_flare,
    Uncertainty: variables.Uncertainty,
  };

  const { vars, setVars } = useProjectVars(project, defaultVars);

  const [modalOpen, setModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  /* =========================
     PROJECTS
  ========================= */
  const projects = useMemo(() => Object.keys(PROJECT_META), []);
  const activeProject = PROJECT_META[project];

  /* =========================
     HANDLERS
  ========================= */
  const handleProjectChange = (projectId) => {
    if (projectId === project) return;

    changeProject(projectId);

    if (setPage) {
      requestAnimationFrame(() => setPage(""));
    }
  };

  const handleModalSave = (nextVars) => {
    setVars(nextVars);
    setModalOpen(false);
  };

  const handleModalClose = (discarded) => {
    setModalOpen(false);

    if (discarded) {
      setNotification({
        type: "warning",
        message: "Изменения отменены",
      });

      setTimeout(() => setNotification(null), 3000);
    }
  };

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

  /* =========================
     RENDER
  ========================= */
  return (
    <div className={s.settings}>
      <SettingsHeader onBack={() => setPage("")} />

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

              return (
                <button
                  key={projectId}
                  onClick={() => handleProjectChange(projectId)}
                  className={`${s.projectButton} ${
                    project === projectId ? s.active : ""
                  }`}
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
