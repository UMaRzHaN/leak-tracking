import { useState } from "react";
import { exportToExcel } from "../../utils/exportToExcel";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import s from "./DatabaseOverflow.module.scss";

export default function DatabaseOverflow({ filteredData, onClearDb }) {
  const projectConfig = useProjectConfig();
  const [open, setOpen] = useState(false);

  const handleExportExcel = () => {
    const excelConfig = projectConfig.export?.excel;

    if (!excelConfig) {
      alert("Экспорт в Excel недоступен для этого проекта");
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
