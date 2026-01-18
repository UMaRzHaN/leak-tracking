import { useMemo, useRef, useState } from "react";
import LeaksMap from "../components/LeaksMap";
import MobileSheet from "../components/MobileSheet";
import MobileSearchButton from "../components/MobileSearchButton";

const NO_STATION_LABEL = "Без станции";

export default function MapPage({ leaks }) {
  const mapApiRef = useRef(null);

  // 🔹 нормализуем leaks
  const normalizedLeaks = useMemo(() => {
    return leaks.map((l) => ({
      ...l,
      station: l.station || NO_STATION_LABEL,
    }));
  }, [leaks]);

  // 🔹 список станций
  const stations = useMemo(() => {
    return Array.from(new Set(normalizedLeaks.map((l) => l.station)));
  }, [normalizedLeaks]);

  // 🔹 включённые станции
  const [enabledStations, setEnabledStations] = useState(() =>
    stations.reduce((acc, s) => {
      acc[s] = true;
      return acc;
    }, {})
  );

  // 🔹 фильтрация leaks
  const visibleLeaks = useMemo(() => {
    return normalizedLeaks.filter((l) => enabledStations[l.station]);
  }, [normalizedLeaks, enabledStations]);

  const toggleStation = (station) => {
    setEnabledStations((prev) => ({
      ...prev,
      [station]: !prev[station],
    }));
  };

  const [open, setOpen] = useState(false);

  return (
    <div className="map-mobile-wrapper">
      <LeaksMap leaks={visibleLeaks} mapApiRef={mapApiRef} />

      <MobileSearchButton onClick={() => setOpen(true)} />

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
