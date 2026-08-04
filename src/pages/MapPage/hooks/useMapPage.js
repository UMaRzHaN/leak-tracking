import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useOfflineMapActions } from "./useOfflineMapActions";
import { useMapFilters } from "./useMapFilters";
import { useMapSelection } from "./useMapSelection";
import { useMapExport } from "./useMapExport";
import { useProjectData } from "@/app/project/ProjectContext";

export function useMapPage({
  leaks,
  coords,
  gpsEnabled = true,
  sharedFilters = null,
}) {
  const { lang } = useLanguage();
  const { activeProject } = useProjectData();
  const exportProjectFolder = activeProject?.folderName;

  const mapModuleRef = useRef(null);
  const containerRef = useRef(null);
  const initialCoordsRef = useRef(coords);
  const initialGpsEnabledRef = useRef(gpsEnabled);
  const mapRef = useRef({
    map: null,
    markersLayer: null,
    locateMe: null,
    setGpsTracking: null,
    setHeatmap: null,
    destroy: null,
  });
  const {
    mapApiRef,
    mapCenter,
    setMapCenter,
    open,
    setOpen,
    focusLeak,
    locateMe,
  } = useMapSelection({ coords, gpsEnabled, mapRef });
  const fittedRef = useRef(false);

  const [notification, setNotification] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const {
    visibleLeaks,
    markerLeaks,
    monitoringFilter,
    hasMonitoringRound,
    mainLocations,
    mainLocationLabel,
    enabledMainLocations,
    locations,
    locationLabel,
    enabledLocations,
    nearbyOnly,
    nearbyRadius,
    nearbyRadiusOptions,
    priorityFilters,
    statusFilters,
    hasGps,
    setMonitoringFilter,
    setNearbyOnly,
    setNearbyRadius,
    togglePriorityFilter,
    clearPriorityFilters,
    toggleStatusFilter,
    clearStatusFilters,
    toggleMainLocation,
    toggleLocation,
  } = useMapFilters({
    leaks,
    coords,
    gpsEnabled,
    sharedFilters,
    activeProjectId: activeProject?.id ?? null,
    open,
    mapCenter,
  });

  const notify = useCallback(
    (type, message) => setNotification({ type, message }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let invalidateFrame = null;
    let invalidateTimeout = null;

    async function initMap() {
      const container = containerRef.current;
      if (!container || mapRef.current.map) return;

      const initialCoords = initialCoordsRef.current;
      const fallbackCenter =
        Number.isFinite(initialCoords?.lat) &&
        Number.isFinite(initialCoords?.lng)
          ? [initialCoords.lat, initialCoords.lng]
          : [41.3111, 69.2797];
      const initialUserCoords =
        Number.isFinite(initialCoords?.lat) &&
        Number.isFinite(initialCoords?.lng)
          ? { lat: initialCoords.lat, lng: initialCoords.lng }
          : null;

      const mapModule =
        mapModuleRef.current ?? (await import("@/pages/MapPage/offlineMap"));
      mapModuleRef.current = mapModule;
      if (cancelled) return;

      const {
        map,
        markersLayer,
        locateMe,
        setGpsTracking,
        setHeatmap,
        destroy,
      } = mapModule.createOfflineMap(container, {
        center: fallbackCenter,
        zoom: 13,
        initialUserCoords: initialGpsEnabledRef.current
          ? initialUserCoords
          : null,
        gpsEnabled: initialGpsEnabledRef.current,
      });

      mapRef.current = {
        map,
        markersLayer,
        locateMe,
        setGpsTracking,
        setHeatmap,
        destroy,
      };
      setMapReady(true);

      invalidateFrame = requestAnimationFrame(() => {
        map.invalidateSize();
        invalidateTimeout = setTimeout(() => map.invalidateSize(), 250);
      });

      map.on("moveend", () => {
        if (map._suppressLeakClickMoveend) {
          map._suppressLeakClickMoveend = false;
          return;
        }

        const center = map.getCenter();
        setMapCenter({ lat: center.lat, lng: center.lng });
      });

      mapApiRef.current = {
        focus: (leak, zoom = 16) => {
          if (!Number.isFinite(leak?.lat) || !Number.isFinite(leak?.lng)) {
            return;
          }
          map.setView([leak.lat, leak.lng], zoom, { animate: true });
        },
      };
    }

    initMap();

    return () => {
      cancelled = true;
      if (invalidateFrame !== null) cancelAnimationFrame(invalidateFrame);
      if (invalidateTimeout !== null) clearTimeout(invalidateTimeout);
      mapRef.current.map?.off("moveend");
      mapRef.current.destroy?.();
      fittedRef.current = false;
      mapRef.current = {
        map: null,
        markersLayer: null,
        locateMe: null,
        setGpsTracking: null,
        setHeatmap: null,
        destroy: null,
      };
      setMapReady(false);
      mapApiRef.current = null;
    };
  }, [mapApiRef, setMapCenter]);

  useEffect(() => {
    mapRef.current.setGpsTracking?.(gpsEnabled, coords);
  }, [coords, gpsEnabled, mapReady]);

  useEffect(() => {
    mapModuleRef.current?.addMarkers?.(
      mapRef.current.markersLayer,
      markerLeaks,
      mapRef.current.map,
    );

    if (fittedRef.current) return;
    const map = mapRef.current.map;
    if (!map) return;

    const validLeaks = markerLeaks.filter(
      (leak) => Number.isFinite(leak.lat) && Number.isFinite(leak.lng),
    );
    if (validLeaks.length === 0) return;

    fittedRef.current = true;
    if (validLeaks.length === 1) {
      map.setView([validLeaks[0].lat, validLeaks[0].lng], 15, {
        animate: false,
      });
    } else {
      map.fitBounds(
        validLeaks.map((leak) => [leak.lat, leak.lng]),
        {
          padding: [40, 40],
          maxZoom: 16,
          animate: false,
        },
      );
    }
  }, [markerLeaks, mapReady]);

  useEffect(() => {
    mapRef.current.setHeatmap?.(heatmapEnabled ? markerLeaks : []);
  }, [heatmapEnabled, markerLeaks, mapReady]);

  const { tileProgress, downloading, handleDownloadArea, cancelDownload } =
    useOfflineMapActions({ mapRef, notify });
  const { handleExportKML } = useMapExport({
    visibleLeaks,
    projectType: activeProject?.type,
    projectFolder: exportProjectFolder,
    notify,
    lang,
  });

  return {
    containerRef,
    open,
    setOpen,
    notification,
    setNotification,
    tileProgress,
    downloading,
    visibleLeaks,
    monitoringFilter,
    hasMonitoringRound,
    mainLocations,
    mainLocationLabel,
    enabledMainLocations,
    locations,
    locationLabel,
    enabledLocations,
    activeProject,
    heatmapEnabled,
    nearbyOnly,
    nearbyRadius,
    nearbyRadiusOptions,
    priorityFilters,
    statusFilters,
    hasGps,
    setHeatmapEnabled,
    setMonitoringFilter,
    setNearbyOnly,
    setNearbyRadius,
    togglePriorityFilter,
    clearPriorityFilters,
    toggleStatusFilter,
    clearStatusFilters,
    toggleMainLocation,
    toggleLocation,
    handleDownloadArea,
    cancelDownload,
    handleExportKML,
    focusLeak,
    locateMe,
  };
}
