import React from "react";
import { useProject } from "../../app/settings/ProjectContext";
import { PROJECT_META } from "../../configs/projects";
import s from "./Settings.module.scss";

export default function Settings({ setPage }) {
  const { project, changeProject } = useProject();

  const projects = Object.keys(PROJECT_META);

  const handleProjectChange = (projectId) => {
    changeProject(projectId);
    // Переходим на главную страницу при смене проекта
    if (setPage) {
      setTimeout(() => setPage(""), 100);
    }
  };

  return (
    <div className={s.settings}>
      <h1>Настройки</h1>

      <div className={s.settingsSection}>
        <h2>Выбор проекта</h2>
        <p>Текущий проект: <strong>{PROJECT_META[project].title}</strong></p>
        <p className={s.description}>{PROJECT_META[project].description}</p>

        <div className={s.projectsList}>
          {projects.map((projectId) => (
            <button
              key={projectId}
              onClick={() => handleProjectChange(projectId)}
              className={`${s.projectButton} ${
                project === projectId ? s.active : ""
              }`}
            >
              <div className={s.projectTitle}>
                {PROJECT_META[projectId].title}
              </div>
              <div className={s.projectDesc}>
                {PROJECT_META[projectId].description}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
