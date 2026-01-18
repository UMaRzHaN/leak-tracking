import { useState } from "react";
import { exportToExcel } from "../../utils/exportToExcel";

import "./DatabaseOverflow.css"; // стили остаются те же

export default function DatabaseOverflow({ filteredData, onClearDb }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-actions">
      {/* overflow */}
      <button className="overflow-btn" onClick={() => setOpen((v) => !v)}>
        ...
      </button>

      {open && (
        <div className="overflow-menu">
          <button onClick={() => exportToExcel(filteredData)}>
            ⬇️ Экспорт в Excel
          </button>

          <div className="overflow-divider" />

          <button className="danger" onClick={onClearDb}>
            🗑 Очистить базу данных
          </button>
        </div>
      )}
    </div>
  );
}
