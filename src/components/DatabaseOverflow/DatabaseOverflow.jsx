import { useState, useCallback } from "react";
import { exportToExcel } from "../../services/exportToExcel";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import { useProject } from "../../app/settings/ProjectContext";
import { useProjectVars } from "../../app/settings/useProjectVars";
import s from "./DatabaseOverflow.module.scss";

export default function DatabaseOverflow({ filteredData, onClearDb }) {
  const { activeProject } = useProject();
  const projectConfig = useProjectConfig();
  const { vars } = useProjectVars(activeProject?.id ?? null, projectConfig.vars);
  const mkdir = activeProject ? `LeakReports/${activeProject.folderName}` : "";

  const [open, setOpen] = useState(false);

  /* =========================
     HELPERS
  ========================= */

  const closeMenu = useCallback(() => setOpen(false), []);
  const toggleMenu = useCallback(() => setOpen((v) => !v), []);

  const excelConfig = projectConfig.export?.excel;
  const canExport = Boolean(excelConfig && vars && filteredData?.length);

  /* =========================
     ACTIONS
  ========================= */

  const handleExportExcel = useCallback(() => {
    if (!excelConfig) {
      alert("Экспорт в Excel недоступен для этого проекта");
      return;
    }

    if (!vars) {
      alert("Параметры проекта не загружены");
      return;
    }

    if (!filteredData?.length) {
      alert("Нет данных для экспорта");
      return;
    }

    exportToExcel(filteredData, excelConfig, mkdir);
    closeMenu();
  }, [excelConfig, vars, filteredData, mkdir, closeMenu]);

  const handleClearDb = useCallback(() => {
    const confirmed = window.confirm(
      "Вы уверены, что хотите очистить базу данных?\n\nЭто действие невозможно отменить.",
    );

    if (!confirmed) return;

    onClearDb();
    closeMenu();
  }, [onClearDb, closeMenu]);

  /* =========================
     RENDER
  ========================= */

  return (
    <>
      {/* BACKDROP */}
      {open && <div className={s.backdrop} onClick={closeMenu} />}

      <div className={s.overflowActions}>
        <button
          type="button"
          className={s.overflowBtn}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggleMenu}
        >
          ⋯
        </button>

        {open && (
          <div className={s.overflowMenu} role="menu">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!canExport}
            >
              <span>⬇️</span>
              Экспорт в Excel
            </button>

            <div className={s.overflowDivider} />

            <button
              type="button"
              className={s.danger}
              onClick={handleClearDb}
              disabled={!canExport}
            >
              <span>🗑</span>
              Очистить базу данных
            </button>
          </div>
        )}
      </div>
    </>
  );
}
