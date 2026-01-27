import React, { useState } from "react";
import { useProject } from "../../app/settings/ProjectContext";
import { PROJECT_META } from "../../configs/projects";
import SettingsHeader from "./SettingsHeader";
import SettingsFooter from "./SettingsFooter";
import SettingsModal from "../../components/SettingsModal/SettingsModal";
import * as variables from "../../data/variables";
import s from "./Settings.module.scss";

export default function Settings({ setPage }) {
  const { project, changeProject } = useProject();
  const [modalOpen, setModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const [vars, setVars] = useState({
    gasType: variables.gasType,
    density: variables.density,
    percentage_gas_to_flare: variables.percentage_gas_to_flare,
    Uncertainty: variables.Uncertainty,
  });

  const projects = Object.keys(PROJECT_META);

  const handleProjectChange = (projectId) => {
    changeProject(projectId);
    // Переходим на главную страницу при смене проекта
    if (setPage) {
      setTimeout(() => setPage(""), 100);
    }
  };

  const handleVariableChange = (key, value) => {
    if (key === "gasType") {
      // При изменении типа газа обновляем плотность
      const newDensity = variables.GAS_TYPES[value].density;
      setVars((prev) => ({ ...prev, gasType: value, density: newDensity }));
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        setVars((prev) => ({ ...prev, [key]: numValue }));
        // Пересчитываем percentage_gas_to_utilization
        if (key === "percentage_gas_to_flare") {
          setVars((prev) => ({
            ...prev,
            percentage_gas_to_utilization: 100 - numValue,
          }));
        }
      }
    }
    setNotification(null);
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

  return (
    <div className={s.settings}>
      <SettingsHeader
        onBack={() => setPage("")}
      />

      {notification && (
        <div className={`${s.notification} ${s[notification.type]}`}>
          <span className={s.notificationIcon}>
            {notification.type === "warning" ? "⚠️" : "ℹ️"}
          </span>
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
            Текущий проект: <strong>{PROJECT_META[project].title}</strong>
          </p>
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

      <SettingsFooter onEditClick={() => setModalOpen(true)} />

      <SettingsModal
        open={modalOpen}
        onClose={handleModalClose}
        variables={vars}
        onVariableChange={handleVariableChange}
      />
    </div>
  );
}
