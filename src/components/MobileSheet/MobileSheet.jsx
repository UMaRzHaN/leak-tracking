import { useMemo, useState } from "react";
import { saveLeaksGeoJSON } from "../../services/saveLeaksGeoJSON";
import s from "./MobileSheet.module.scss";

const NO_STATION_LABEL = "Без станции";

async function handleExport(leaks) {
  try {
    if (!leaks.length) {
      alert("Нет данных для экспорта");
      return;
    }

    const fileName = await saveLeaksGeoJSON(leaks);
    alert(`Файл создан: ${fileName}`);
  } catch (e) {
    alert("Ошибка экспорта");
    console.error(e);
  }
}

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
      {open && (
        <div className={s.overlay} onClick={onClose}>
          <div
            className={`${s.sheet} ${open ? s.open : ""}`}
            onClick={(e) => e.stopPropagation()}
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

            {/* ===== КНОПКА ЭКСПОРТА ===== */}
            <div className={s.sheetActions}>
              <button
                className={s.exportBtn}
                onClick={() => handleExport(filteredLeaks)}
              >
                Экспорт карты (GeoJSON)
              </button>
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
