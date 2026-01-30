import { useMemo, useState } from "react";

import s from "./MobileSheet.module.scss";
import { saveLeaksKML } from "../../services/saveLeaksKML";
import { useProject } from "../../app/settings/ProjectContext";
import { getProjectMobileDir } from "../../constants/storage.constants";

const NO_LABEL = "Не указано";

/* =========================
   EXPORT HANDLER
========================= */
async function handleExport(leaks, saveFn) {
  try {
    if (!leaks.length) {
      alert("Нет данных для экспорта");
      return;
    }

    if (!saveFn) {
      alert("Экспорт недоступен для этого проекта");
      return;
    }

    const fileName = await saveFn();
    alert(`Файл создан: ${fileName}`);
  } catch (e) {
    alert("Ошибка экспорта");
    console.error(e);
  }
}

/* =========================
   COMPONENT
========================= */
export default function MobileSheet({
  open,
  leaks,
  locations,
  locationLabel,
  enabledLocations,
  onToggleLocation,
  onClose,
  onSelect,
}) {
  const project = useProject();
  const mkdir = getProjectMobileDir(project);

  const [query, setQuery] = useState("");

  /* =========================
     SEARCH FILTER
  ========================= */
  const filteredLeaks = useMemo(() => {
    if (!query) return leaks;

    const q = query.toLowerCase();
    return leaks.filter((l) => String(l.leak_id).toLowerCase().includes(q));
  }, [leaks, query]);

  return (
    <>
      {open && (
        <div className={s.overlay} onClick={onClose}>
          <div
            className={`${s.sheet} ${s.open}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={s.sheetHandle} />

            {/* ===== LOCATION FILTER ===== */}
            <div className={s.stationList}>
              <div className={s.stationTitle}>Фильтр по: {locationLabel}</div>

              {locations.map((loc) => {
                const label = loc || NO_LABEL;

                return (
                  <label key={label} className={s.stationItem}>
                    <input
                      type="checkbox"
                      checked={enabledLocations[label] ?? true}
                      onChange={() => onToggleLocation(label)}
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>

            {/* ===== SEARCH ===== */}
            <div className={s.sheetSearch}>
              <input
                type="search"
                placeholder="Поиск по ID утечки…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {/* ===== EXPORT ===== */}
            <div className={s.sheetActions}>
              <button
                className={`${s.exportBtn} ${s.exportKml}`}
                onClick={() =>
                  handleExport(filteredLeaks, () =>
                    saveLeaksKML(filteredLeaks, project.project, mkdir),
                  )
                }
              >
                Экспорт карты (KML)
              </button>
            </div>

            {/* ===== LIST ===== */}
            <div className={s.sheetList}>
              {filteredLeaks.map((leak) => (
                <div
                  key={leak.id}
                  className={s.sheetItem}
                  onClick={() => onSelect(leak)}
                >
                  <span className={s.dot} />
                  Leak ID {leak.leak_id}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
