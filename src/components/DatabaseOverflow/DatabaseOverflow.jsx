import { useState, useRef, useEffect } from "react";
import { exportToExcel } from "../../utils/exportToExcel";
import s from "./DatabaseOverflow.module.scss";

export default function DatabaseOverflow({ filteredData, onClearDb }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  return (
    <div className={s.overflowActions} ref={menuRef}>
      {/* overflow */}
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
            ⬇️ Экспорт в Excel
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
            🗑 Очистить базу данных
          </button>
        </div>
      )}
    </div>
  );
}
