import { useState } from "react";
import { exportToExcel } from "../../services/exportToExcel";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import { useProject } from "../../app/settings/ProjectContext";
import { useProjectVars } from "../../app/settings/useProjectVars";
import s from "./DatabaseOverflow.module.scss";

export default function DatabaseOverflow({ filteredData, onClearDb }) {
  const { project } = useProject(); // ✅ гарантированный projectId
  const projectConfig = useProjectConfig();

  // ✅ vars строго из storage_key
  const { vars } = useProjectVars(project, projectConfig.vars);

  const [open, setOpen] = useState(false);

  const handleExportExcel = () => {
    const excelConfig = projectConfig.export?.excel;

    if (!excelConfig) {
      alert("Экспорт в Excel недоступен для этого проекта");
      return;
    }

    if (!vars) {
      alert("Параметры проекта не загружены");
      return;
    }

    exportToExcel(filteredData, excelConfig);
    setOpen(false);
  };

  return (
    <>
      {/* BACKDROP */}
      {open && <div className={s.backdrop} onClick={() => setOpen(false)} />}

      <div className={s.overflowActions}>
        <button
          type="button"
          className={s.overflowBtn}
          onClick={() => setOpen((v) => !v)}
        >
          ...
        </button>

        {open && (
          <div className={s.overflowMenu}>
            <button type="button" onClick={handleExportExcel}>
              <span>⬇️</span>
              Экспорт в Excel
            </button>

            <div className={s.overflowDivider} />

            <button
              type="button"
              className={s.danger}
              onClick={() => {
                onClearDb();
                setOpen(false);
              }}
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
