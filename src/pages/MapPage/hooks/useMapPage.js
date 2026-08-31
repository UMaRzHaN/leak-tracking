import { useCallback, useEffect, useRef, useState } from "react";
import { useOfflineMapActions } from "./useOfflineMapActions";
import { useMapFilters } from "./useMapFilters";
import { useMapSelection } from "./useMapSelection";
import { useMapExport } from "./useMapExport";
import { useProjectData } from "@/app/project/ProjectContext";
import { useMapComponents } from "./useMapComponents";
import { useMapComponentsView } from "./useMapComponentsView";
import { MAP_BASE } from "@/pages/MapPage/mapBase";

export function useMapPage({
  leaks,
  coords,
  gpsEnabled = true,
  sharedFilters = /** @type {any} */ (null),
  base: controlledBase = /** @type {string|null} */ (null),
  onBaseChange = /** @type {((base: string) => void)|null} */ (null),
}) {
  const { activeProject } = useProjectData();
  const exportProjectFolder = activeProject?.folderName;

  const mapModuleRef = useRef(/** @type {any} */ (null));
  const containerRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const initialCoordsRef = useRef(coords);
  const initialGpsEnabledRef = useRef(gpsEnabled);
  // Ручка живой карты: её собирает `offlineMap`, и описывать её форму здесь
  // значило бы вести второй список рядом с настоящим.
  const mapRef = useRef(
    /** @type {any} */ ({
      map: null,
      markersLayer: null,
      locateMe: null,
      setGpsTracking: null,
      setHeatmap: null,
      destroy: null,
    }),
  );
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

  /*
   * Одна карта на две базы, но не одним слоем: утечка — событие, компонент —
   * объект, их считают разные люди для разных отчётов, и смешанные булавки
   * сделали бы вопрос «сколько их» без ответа для обеих.
   */
  const [ownBase, setOwnBase] = useState(MAP_BASE.LEAKS);
  // Базу может держать приложение: по ней шапка выбирает, чьё дерево мест
  // показывать. Своя остаётся на случай, когда карту открывают саму по себе.
  const base = controlledBase ?? ownBase;
  const setBase = onBaseChange ?? setOwnBase;
  const {
    available: componentsAvailable,
    markers: componentMarkers,
    loading: componentsLoading,
  } = useMapComponents(base === MAP_BASE.COMPONENTS);

  const [notification, setNotification] = useState(/** @type {any} */ (null));
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

  const showsComponents = base === MAP_BASE.COMPONENTS;
  const { visible: visibleComponents, status: componentStatus } =
    useMapComponentsView({
      markers: componentMarkers,
      showsComponents,
      sharedFilters,
      nearbyOnly,
      nearbyRadius,
      coords,
    });

  const shownItems = showsComponents ? visibleComponents : visibleLeaks;
  const shownMarkers = showsComponents ? visibleComponents : markerLeaks;

  const notify = useCallback(
    (type, message) => setNotification({ type, message }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let invalidateFrame = /** @type {number|null} */ (null);
    let invalidateTimeout = /** @type {ReturnType<typeof setTimeout>|null} */ (
      null
    );

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

  // Смена базы — это другой набор точек, и вид на прежнюю к нему отношения не
  // имеет: карта подгоняется под то, что показывает теперь.
  useEffect(() => {
    fittedRef.current = false;
  }, [base]);

  useEffect(() => {
    mapModuleRef.current?.addMarkers?.(
      mapRef.current.markersLayer,
      shownMarkers,
      mapRef.current.map,
    );

    if (fittedRef.current) return;
    const map = mapRef.current.map;
    if (!map) return;

    const validLeaks = shownMarkers.filter(
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
  }, [shownMarkers, mapReady]);

  useEffect(() => {
    mapRef.current.setHeatmap?.(heatmapEnabled ? shownMarkers : []);
  }, [heatmapEnabled, shownMarkers, mapReady]);

  const { tileProgress, downloading, handleDownloadArea, cancelDownload } =
    useOfflineMapActions({ mapRef, notify });
  // Выгружается то, что на экране: переключив базу, человек ждёт от кнопки
  // именно её, а не другую.
  const { handleExportKML } = useMapExport({
    visibleLeaks: shownItems,
    showsComponents,
    projectType: activeProject?.type,
    projectFolder: exportProjectFolder,
    notify,
  });

  return {
    containerRef,
    open,
    setOpen,
    notification,
    setNotification,
    tileProgress,
    downloading,
    visibleLeaks: shownItems,
    base,
    setBase,
    componentStatus,
    componentsAvailable,
    componentsLoading,
    showsComponents,
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
