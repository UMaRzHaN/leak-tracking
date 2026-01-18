import { useMemo, useState } from "react";

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

  // нормализуем leaks (если нет station)
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
      String(l.leak_id).toLowerCase().includes(q)
    );
  }, [normalizedLeaks, query]);

  return (
    <div className={`sheet ${open ? "open" : ""}`}>
      <div className="sheet-handle" onClick={onClose} />

      {/* ===== СТАНЦИИ (LAYERS) ===== */}
      <div className="station-list">
        {stations.map((station) => {
          const label = station || NO_STATION_LABEL;

          return (
            <label key={label} className="station-item">
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
      <div className="sheet-search">
        <input
          type="search"
          placeholder="Поиск по ID утечки…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* ===== СПИСОК УТЕЧЕК ===== */}
      <div className="sheet-list">
        {filteredLeaks.length === 0 && (
          <div className="sheet-empty">Нет утечек</div>
        )}

        {filteredLeaks.map((leak) => (
          <div
            key={leak.id}
            className="sheet-item"
            onClick={() => onSelect(leak)}
          >
            <span className="dot" />
            Leak ID {leak.leak_id}
          </div>
        ))}
      </div>
    </div>
  );
}
