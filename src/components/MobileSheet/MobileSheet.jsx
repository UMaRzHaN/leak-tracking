import { useMemo, useState } from "react";

import s from "./MobileSheet.module.scss";
import Notification from "../Notification/Notification";

const NO_LABEL = "Не указано";

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
  const [query, setQuery] = useState("");
  const [notification, setNotification] = useState(null);

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
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

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
