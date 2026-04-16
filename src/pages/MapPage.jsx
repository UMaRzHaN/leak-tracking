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

  const offlineRef = useRef({
    map: null,
    markersLayer: null,
  });

  const { mode: mapMode, setMode } = useMapMode();

  const {
    leaks: normalizedLeaks,
    locations,
    label: locationLabel,
  } = useActiveLocation(leaks);

  const [mapCenter, setMapCenter] = useState(null);
  const [open, setOpen] = useState(false);
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

  const visibleLeaks = useMemo(() => {
    const filtered = normalizedLeaks.filter((l) => enabledLocations[l._location]);

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

  useEffect(() => {
    if (mapMode !== "offline") return;

    const container = offlineMapContainerRef.current;
    if (!container) return;

    if (offlineRef.current.map) return;

    const firstLeak = visibleLeaks.find(
      (l) => Number.isFinite(l.lat) && Number.isFinite(l.lng),
    );

    const center =
      Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng)
        ? [coords.lat, coords.lng]
        : firstLeak
          ? [firstLeak.lat, firstLeak.lng]
          : [41.3111, 69.2797];

    const { map, markersLayer } = createOfflineMap(container, {
      center,
      zoom: 13,
    });

    offlineRef.current = { map, markersLayer };

    mapApiRef.current = {
      focus: (leak) => {
        if (!Number.isFinite(leak?.lat) || !Number.isFinite(leak?.lng)) return;
        map.setView([leak.lat, leak.lng], 16, { animate: true });
      },
    };

    return () => {
      map.remove();
      offlineRef.current = { map: null, markersLayer: null };
      mapApiRef.current = null;
    };
  }, [mapMode, coords, visibleLeaks]);

  useEffect(() => {
    if (mapMode !== "offline") return;

    const { markersLayer } = offlineRef.current;
    if (!markersLayer) return;

    addMarkers(markersLayer, visibleLeaks);
  }, [visibleLeaks, mapMode]);

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
          onError={() => setMode("offline")}
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