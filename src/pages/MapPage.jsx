import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LeaksMap from "../components/LeaksMap/LeaksMap";
import MobileSheet from "../components/MobileSheet/MobileSheet";
import { getDistanceMeters } from "../utils/getDistanceMeters";

const NO_STATION_LABEL = "Без станции";

export default function MapPage({ leaks, coords }) {
  const mapApiRef = useRef(null);

  /* ======================================================
     MAP CENTER (from map idle)
     ====================================================== */
  const [mapCenter, setMapCenter] = useState(null);

  /* ======================================================
     NORMALIZE LEAKS
     ====================================================== */
  const normalizedLeaks = useMemo(() => {
    return leaks.map((l) => ({
      ...l,
      station: l.station || NO_STATION_LABEL,
    }));
  }, [leaks]);

  /* ======================================================
     STATIONS LIST
     ====================================================== */
  const stations = useMemo(() => {
    return Array.from(new Set(normalizedLeaks.map((l) => l.station)));
  }, [normalizedLeaks]);

  /* ======================================================
     ENABLED STATIONS
     ====================================================== */
  const [enabledStations, setEnabledStations] = useState({});

  // корректно инициализируем / дополняем при изменении stations
  useEffect(() => {
    setEnabledStations((prev) => {
      const next = { ...prev };

      stations.forEach((s) => {
        if (!(s in next)) next[s] = true;
      });

      return next;
    });
  }, [stations]);

  const toggleStation = useCallback((station) => {
    setEnabledStations((prev) => ({
      ...prev,
      [station]: !prev[station],
    }));
  }, []);

  /* ======================================================
     FILTER + SORT BY DISTANCE
     ====================================================== */
  const visibleLeaks = useMemo(() => {
    const filtered = normalizedLeaks.filter((l) => enabledStations[l.station]);

    if (!mapCenter) return filtered;

    return filtered
      .map((l) => ({
        ...l,
        _distance: getDistanceMeters(
          mapCenter.lat,
          mapCenter.lng,
          l.lat,
          l.lon,
        ),
      }))
      .sort((a, b) => a._distance - b._distance);
  }, [normalizedLeaks, enabledStations, mapCenter]);

  /* ======================================================
     MOBILE SHEET
     ====================================================== */
  const [open, setOpen] = useState(false);

  return (
    <div className="map-mobile-wrapper">
      <LeaksMap
        leaks={visibleLeaks}
        mapApiRef={mapApiRef}
        onSearchClick={() => setOpen(true)}
        onMoveEnd={setMapCenter}
        coords={coords}
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
