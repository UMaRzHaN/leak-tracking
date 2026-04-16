import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LeaksMap from "../components/LeaksMap/LeaksMap";
import MobileSheet from "../components/MobileSheet/MobileSheet";
import { getDistanceMeters } from "../utils/calculations/getDistanceMeters";
import { useActiveLocation } from "../hooks/useActiveLocation";
import { useMapMode } from "../hooks/useMapMode";
import { createOfflineMap, addMarkers } from "../services/maps/offlineMap";

export default function MapPage({ leaks, coords }) {
  const mapApiRef = useRef(null);
  const offlineMapContainerRef = useRef(null);

  const mapMode = useMapMode();

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
     OFFLINE MAP MODE
     ====================================================== */
  useEffect(() => {
    if (mapMode !== "offline") return;
    const container = offlineMapContainerRef.current;
    if (!container) return;

    const firstLeak = visibleLeaks.find(
      (l) => Number.isFinite(l.lat) && Number.isFinite(l.lng),
    );

    const center =
      Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng)
        ? [coords.lat, coords.lng]
        : firstLeak
          ? [firstLeak.lat, firstLeak.lng]
          : [41.3111, 69.2797];

    const map = createOfflineMap(container, {
      center,
      zoom: 13,
    });

    addMarkers(map, visibleLeaks);

    mapApiRef.current = {
      focus: (leak) => {
        if (!Number.isFinite(leak?.lat) || !Number.isFinite(leak?.lng)) return;
        map.setView([leak.lat, leak.lng], 16, { animate: true });
      },
    };

    return () => {
      map.remove();
      mapApiRef.current = null;
    };
  }, [mapMode, visibleLeaks, coords]);

  /* ======================================================
     MOBILE SHEET
     ====================================================== */
  const [open, setOpen] = useState(false);

  return (
    <div className="map-mobile-wrapper">
      {mapMode === "offline" ? (
        <div
          ref={offlineMapContainerRef}
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <LeaksMap
          leaks={visibleLeaks}
          mapApiRef={mapApiRef}
          onSearchClick={() => setOpen(true)}
          onMoveEnd={setMapCenter}
          coords={coords}
        />
      )}

      <MobileSheet
        open={open}
        leaks={visibleLeaks}
        locations={locations}
        locationLabel={locationLabel}
        enabledLocations={enabledLocations}
        onToggleLocation={toggleLocation}
        onClose={() => setOpen(false)}
        onSelect={(leak) => {
          mapApiRef.current?.focus?.(leak);
          setOpen(false);
        }}
      />
    </div>
  );
}