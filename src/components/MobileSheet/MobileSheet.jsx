import { useMemo, useState } from "react";
import s from "./MobileSheet.module.scss";

const NO_STATION_LABEL = "Без станции";

export default function MobileSheet({
  open,
  leaks,
  stations,
  enabledStations,
  onToggleStation,
  onClose,
  onSelect,
}) {
  const [query, setQuery] = useState("");

  const normalizedLeaks = useMemo(() => {
    return leaks.map((leak) => ({
      ...leak,
      station: leak.station || NO_STATION_LABEL,
    }));
  }, [leaks]);

  const filteredLeaks = useMemo(() => {
    if (!query) return normalizedLeaks;
    const q = query.toLowerCase();
    return normalizedLeaks.filter((l) =>
      String(l.leak_id).toLowerCase().includes(q),
    );
  }, [normalizedLeaks, query]);

  return (
    <>
      {/* ===== OVERLAY ===== */}
      {open && (
        <div className={s.overlay} onClick={onClose}>
          {/* ===== SHEET ===== */}
          <div
            className={`${s.sheet} ${open ? s.open : ""}`}
            onClick={(e) => e.stopPropagation()} // ⛔ не даём клику всплыть
          >
            <div className={s.sheetHandle} />

            {/* ===== СТАНЦИИ ===== */}
            <div className={s.stationList}>
              {stations.map((station) => {
                const label = station || NO_STATION_LABEL;

                return (
                  <label key={label} className={s.stationItem}>
                    <input
                      type="checkbox"
                      checked={!!enabledStations[label]}
                      onChange={() => onToggleStation(label)}
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>

            {/* ===== ПОИСК ===== */}
            <div className={s.sheetSearch}>
              <input
                type="search"
                placeholder="Поиск по ID утечки…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {/* ===== СПИСОК ===== */}
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
