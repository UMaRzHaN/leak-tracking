import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LeaksMap from "../components/LeaksMap/LeaksMap";
import MobileSheet from "../components/MobileSheet/MobileSheet";
import { getDistanceMeters } from "../utils/calculations/getDistanceMeters";
import { useActiveLocation } from "../hooks/useActiveLocation";

export default function MapPage({ leaks, coords }) {
  const mapApiRef = useRef(null);

  /* ======================================================
     ACTIVE LOCATION (project-aware)
     ====================================================== */
  const {
    leaks: normalizedLeaks,
    locations,
    label: locationLabel,
  } = useActiveLocation(leaks);

  /* ======================================================
     MAP CENTER (from map idle)
     ====================================================== */
  const [mapCenter, setMapCenter] = useState(null);

  /* ======================================================
     ENABLED LOCATIONS
     ====================================================== */
  const [enabledLocations, setEnabledLocations] = useState({});

  // корректная инициализация / дополнение при смене locations
  useEffect(() => {
    setEnabledLocations((prev) => {
      const next = {};
      locations.forEach((loc) => {
        next[loc] = prev[loc] ?? true;
      });
      return next;
    });
  }, [locations]);

  const toggleLocation = useCallback((location) => {
    setEnabledLocations((prev) => ({
      ...prev,
      [location]: !prev[location],
    }));
  }, []);

  /* ======================================================
     FILTER + SORT BY DISTANCE
     ====================================================== */
  const visibleLeaks = useMemo(() => {
    const filtered = normalizedLeaks.filter(
      (l) => enabledLocations[l._location],
    );

    if (!mapCenter) return filtered;

    return filtered
      .map((l) => ({
        ...l,
        _distance: getDistanceMeters(
          mapCenter.lat,
          mapCenter.lng,
          l.lat,
          l.lng,
        ),
      }))
      .sort((a, b) => a._distance - b._distance);
  }, [normalizedLeaks, enabledLocations, mapCenter]);

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
        locations={locations}
        locationLabel={locationLabel}
        enabledLocations={enabledLocations}
        onToggleLocation={toggleLocation}
        onClose={() => setOpen(false)}
        onSelect={(leak) => {
          mapApiRef.current?.focus(leak);
          setOpen(false);
        }}
      />
    </div>
  );
}
