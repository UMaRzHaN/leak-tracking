import { useState } from "react";
import { exportToExcel } from "../../utils/exportToExcel";
import s from "./DatabaseOverflow.module.scss";

export default function DatabaseOverflow({ filteredData, onClearDb }) {
  const [open, setOpen] = useState(false);

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
            <button
              type="button"
              onClick={() => {
                exportToExcel(filteredData);
                setOpen(false);
              }}
            >
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
