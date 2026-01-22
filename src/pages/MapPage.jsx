import { useCallback, useMemo, useRef, useState } from "react";
import LeaksMap from "../components/LeaksMap/LeaksMap";
import MobileSheet from "../components/MobileSheet/MobileSheet";
import { getDistanceMeters } from "../utils/getDistanceMeters";

const NO_STATION_LABEL = "Без станции";

export default function MapPage({ leaks }) {
  const mapApiRef = useRef(null);
  /* ===============================
     Состояние центра карты
     =============================== */
  const [mapCenter, setMapCenter] = useState(null);
  // 🔹 нормализуем leaks
  /* ===============================
     Нормализация leaks
     =============================== */
  const normalizedLeaks = useMemo(() => {
    return leaks.map((l) => ({
      ...l,
      station: l.station || NO_STATION_LABEL,
    }));
  }, [leaks]);

  /* ===============================
     Список станций
     =============================== */
  const stations = useMemo(() => {
    return Array.from(new Set(normalizedLeaks.map((l) => l.station)));
  }, [normalizedLeaks]);

  /* ===============================
     Включённые станции
     =============================== */
  const [enabledStations, setEnabledStations] = useState(() =>
    stations.reduce((acc, s) => {
      acc[s] = true;
      return acc;
    }, {})
  );

  const toggleStation = useCallback((station) => {
    setEnabledStations((prev) => ({
      ...prev,
      [station]: !prev[station],
    }));
  }, []);

  /* ===============================
     Фильтрация + сортировка по расстоянию
     =============================== */
  const visibleLeaks = useMemo(() => {
    const filtered = normalizedLeaks.filter(
      (l) => enabledStations[l.station]
    );

    if (!mapCenter) return filtered;

    return filtered
      .map((l) => ({
        ...l,
        _distance: getDistanceMeters(
          mapCenter.lat,
          mapCenter.lng,
          l.lat,
          l.lng
        ),
      }))
      .sort((a, b) => a._distance - b._distance);
  }, [normalizedLeaks, enabledStations, mapCenter]);

  /* ===============================
     Mobile sheet
     =============================== */
  const [open, setOpen] = useState(false);

  return (
    <div className="map-mobile-wrapper">
      <LeaksMap
        leaks={visibleLeaks}
        mapApiRef={mapApiRef}
        onSearchClick={() => setOpen(true)}
        onMoveEnd={(center) => setMapCenter(center)} 
      />

      <MobileSheet
        open={open}
        leaks={visibleLeaks}
        stations={stations}
        enabledStations={enabledStations}
        onToggleStation={toggleStation}
        onClose={() => setOpen(false)}
        onSelect={(leak) => {
          mapApiRef.current?.focus(leak);
          setOpen(false);
        }}
      />
    </div>
  );
}
