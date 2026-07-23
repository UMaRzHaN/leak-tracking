import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { getDistanceMeters } from "@/utils/geoUtils";
import { STATUS } from "@/utils/status";
import { handleExport } from "@/pages/MapPage/handleExport";
import { readMonitoringRound } from "@/utils/monitoringRound";
import {
  buildLocationFilterFromEnabled,
  buildSmartLocationSelection,
  getEnabledLocations,
} from "@/utils/locationFilter";
import {
  MONITORING_FILTER,
  filterLeaksByMonitoring,
} from "@/pages/Monitoring/monitoringDomain";
import {
  NEARBY_RADIUS_M,
  normalizeMultiFilter,
} from "@/pages/DataBase/hooks/useDataBaseFilters";

const NEARBY_RADIUS_OPTIONS = [100, 500, 1000];

export function useMapPage({
  leaks,
  coords,
  gpsEnabled = true,
  sharedFilters = null,
}) {
  const { lang } = useLanguage();
  const { activeProject } = useProjectData();
  const exportProjectFolder = activeProject?.folderName;

  const mapApiRef = useRef(null);
  const mapModuleRef = useRef(null);
  const containerRef = useRef(null);
  const latestCoordsRef = useRef(coords);
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
  const fittedRef = useRef(false);
  const distanceCacheRef = useRef(new Map());

  const {
    leaks: normalizedLeaks,
    locations,
    secondary: locationKey,
    label: locationLabel,
  } = useActiveLocation(leaks);

  const [mapCenter, setMapCenter] = useState(null);
  const [open, setOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const [tileProgress, setTileProgress] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [localNearbyOnly, setLocalNearbyOnly] = useState(false);
  const [localNearbyRadius, setLocalNearbyRadius] = useState(NEARBY_RADIUS_M);
  const [localPriorityFilter, setLocalPriorityFilter] = useState([]);
  const [localStatusFilter, setLocalStatusFilter] = useState([]);
  const [localLocationFilter, setLocalLocationFilter] = useState(null);
  const [localMonitoringFilter, setLocalMonitoringFilter] = useState(
    MONITORING_FILTER.DUE,
  );
  const monitoringRound = useMemo(
    () => readMonitoringRound(activeProject?.id ?? null),
    [activeProject?.id],
  );
  const monitoringRoundId = monitoringRound?.id ?? null;
  const monitoringRoundNumber = monitoringRound?.number ?? null;
  const hasMonitoringRound = Boolean(monitoringRoundId);

  const nearbyOnly = sharedFilters?.nearbyFilter ?? localNearbyOnly;
  const setNearbyOnly = sharedFilters?.setNearbyFilter ?? setLocalNearbyOnly;
  const nearbyRadius = sharedFilters?.nearbyRadius ?? localNearbyRadius;
  const setNearbyRadius =
    sharedFilters?.setNearbyRadius ?? setLocalNearbyRadius;
  const priorityFilters = normalizeMultiFilter(
    sharedFilters?.priorityFilter ?? localPriorityFilter,
  );
  const setPriorityFilter =
    sharedFilters?.setPriorityFilter ?? setLocalPriorityFilter;
  const statusFilters = normalizeMultiFilter(
    sharedFilters?.statusFilter ?? localStatusFilter,
  );
  const setStatusFilter = sharedFilters?.setFilter ?? setLocalStatusFilter;
  const monitoringFilter =
    sharedFilters?.monitoringFilter ?? localMonitoringFilter;
  const setMonitoringFilter =
    sharedFilters?.setMonitoringFilter ?? setLocalMonitoringFilter;
  const sharedSearch = sharedFilters?.search ?? "";
  const hasSharedLocationFilter =
    typeof sharedFilters?.setLocationFilter === "function";
  const locationFilter = hasSharedLocationFilter
    ? (sharedFilters.locationFilter ?? null)
    : localLocationFilter;
  const setLocationFilter = hasSharedLocationFilter
    ? sharedFilters.setLocationFilter
    : setLocalLocationFilter;
  const enabledLocations = useMemo(
    () => getEnabledLocations(locations, locationKey, locationFilter),
    [locationFilter, locationKey, locations],
  );

  const notify = useCallback(
    (type, message) => setNotification({ type, message }),
    [],
  );

  useEffect(() => {
    latestCoordsRef.current = coords;
  }, [coords]);

  useEffect(() => {
    const selection = buildSmartLocationSelection(locations, sharedSearch);
    if (!selection) return;
    setLocationFilter(
      buildLocationFilterFromEnabled(locations, locationKey, selection),
    );
  }, [locationKey, locations, setLocationFilter, sharedSearch]);

  const toggleLocation = useCallback(
    (location) => {
      setLocationFilter((current) => {
        const currentEnabled = getEnabledLocations(
          locations,
          locationKey,
          current,
        );
        const nextEnabled = {
          ...currentEnabled,
          [location]: !currentEnabled[location],
        };
        return buildLocationFilterFromEnabled(
          locations,
          locationKey,
          nextEnabled,
        );
      });
    },
    [locationKey, locations, setLocationFilter],
  );

  const filteredLeaks = useMemo(
    () =>
      normalizedLeaks.filter(
        (leak) =>
          enabledLocations[leak._location] &&
          (statusFilters.length === 0 ||
            statusFilters.includes(leak.status ?? STATUS.OPEN)) &&
          (priorityFilters.length === 0 ||
            priorityFilters.includes(leak.priority ?? null)),
      ),
    [normalizedLeaks, enabledLocations, statusFilters, priorityFilters],
  );

  const togglePriorityFilter = useCallback(
    (priority) => {
      setPriorityFilter((current) => {
        const values = normalizeMultiFilter(current);
        return values.includes(priority)
          ? values.filter((item) => item !== priority)
          : [...values, priority];
      });
    },
    [setPriorityFilter],
  );

  const toggleStatusFilter = useCallback(
    (status) => {
      setStatusFilter((current) => {
        const values = normalizeMultiFilter(current);
        return values.includes(status)
          ? values.filter((item) => item !== status)
          : [...values, status];
      });
    },
    [setStatusFilter],
  );

  const mapOrderedLeaks = useMemo(() => {
    const hasGps = Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng);

    if (nearbyOnly && hasGps) {
      return filteredLeaks
        .map((leak) => ({
          ...leak,
          _distance: getDistanceMeters(
            coords.lat,
            coords.lng,
            leak.lat,
            leak.lng,
          ),
        }))
        .filter((leak) => leak._distance <= nearbyRadius)
        .sort((left, right) => left._distance - right._distance);
    }

    if (!mapCenter) return filteredLeaks;

    const roundedLat = Math.round(mapCenter.lat * 1000) / 1000;
    const roundedLng = Math.round(mapCenter.lng * 1000) / 1000;
    const cache = distanceCacheRef.current;

    const sorted = filteredLeaks
      .map((leak) => {
        const key = `${leak.id}_${roundedLat}_${roundedLng}`;
        let distance = cache.get(key);

        if (distance === undefined) {
          distance = getDistanceMeters(
            mapCenter.lat,
            mapCenter.lng,
            leak.lat,
            leak.lng,
          );
          if (cache.size > 2000) cache.delete(cache.keys().next().value);
          cache.set(key, distance);
        }

        return { ...leak, _distance: distance };
      })
      .sort((left, right) => left._distance - right._distance);

    return sorted;
  }, [filteredLeaks, mapCenter, nearbyOnly, nearbyRadius, coords]);

  const visibleLeaks = useMemo(
    () =>
      filterLeaksByMonitoring(
        mapOrderedLeaks,
        hasMonitoringRound ? monitoringFilter : MONITORING_FILTER.ALL,
        monitoringRoundId,
        monitoringRoundNumber,
      ),
    [
      mapOrderedLeaks,
      hasMonitoringRound,
      monitoringFilter,
      monitoringRoundId,
      monitoringRoundNumber,
    ],
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
  }, []);

  useEffect(() => {
    mapRef.current.setGpsTracking?.(gpsEnabled, latestCoordsRef.current);
  }, [gpsEnabled, mapReady]);

  useEffect(() => {
    mapModuleRef.current?.addMarkers?.(
      mapRef.current.markersLayer,
      visibleLeaks,
      mapRef.current.map,
    );

    if (fittedRef.current) return;
    const map = mapRef.current.map;
    if (!map) return;

    const validLeaks = visibleLeaks.filter(
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
  }, [visibleLeaks, mapReady]);

  useEffect(() => {
    mapRef.current.setHeatmap?.(heatmapEnabled ? visibleLeaks : []);
  }, [heatmapEnabled, visibleLeaks, mapReady]);

  const handleDownloadArea = useCallback(async () => {
    const map = mapRef.current.map;
    if (!map || downloading) return;

    setDownloading(true);
    try {
      const { preloadUrls, buildTileUrls, buildViewportTileUrls } =
        await import("@/services/maps/tileCache");
      const urlSet = new Set();
      const validLeaks = visibleLeaks.filter(
        (leak) => Number.isFinite(leak.lat) && Number.isFinite(leak.lng),
      );
      const zoomFactor = 2 ** 14;
      const seen = new Set();
      const uniqueLeaks = validLeaks.filter(({ lat, lng }) => {
        const tileX = Math.floor(((lng + 180) / 360) * zoomFactor);
        const latRad = (lat * Math.PI) / 180;
        const tileY = Math.floor(
          ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
            2) *
            zoomFactor,
        );
        const key = `${tileX}:${tileY}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      for (const point of uniqueLeaks) {
        for (const url of buildTileUrls(point.lat, point.lng, 13, 13)) {
          urlSet.add(url);
        }
      }

      const bounds = map.getBounds();
      for (const url of buildViewportTileUrls(
        {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        },
        Math.floor(map.getZoom()),
        Math.floor(map.getZoom()),
      )) {
        urlSet.add(url);
      }

      const urls = [...urlSet];
      if (urls.length === 0) {
        notify(
          "error",
          lang === "ru" ? "Нет тайлов для скачивания" : "No tiles to download",
        );
        return;
      }

      setTileProgress({ done: 0, total: urls.length, status: null });
      const stats = await preloadUrls(urls, {
        onProgress: (done, total) =>
          setTileProgress({ done, total, status: null }),
      });
      const hasAvailableTiles = stats.saved > 0 || stats.alreadyCached > 0;
      setTileProgress({
        done: urls.length,
        total: urls.length,
        status: hasAvailableTiles ? "success" : "error",
        stats,
      });
    } catch {
      setTileProgress({ done: 0, total: 0, status: "error" });
    } finally {
      setDownloading(false);
      setTimeout(() => setTileProgress(null), 2500);
    }
  }, [downloading, visibleLeaks, notify, lang]);

  const handleExportKML = useCallback(async () => {
    const { saveLeaksKML } = await import("@/pages/MapPage/kml");

    await handleExport({
      leaks: visibleLeaks,
      saveFn: () =>
        saveLeaksKML(
          visibleLeaks,
          activeProject?.type,
          exportProjectFolder,
          lang,
        ),
      onSuccess: (result) =>
        notify(
          "success",
          result?.message ||
            (lang === "ru"
              ? "KML-файл успешно экспортирован"
              : "KML file exported successfully"),
        ),
      onError: (message) => notify("error", message),
      lang,
    });
  }, [visibleLeaks, activeProject?.type, exportProjectFolder, notify, lang]);

  const focusLeak = useCallback((leak, zoom) => {
    mapApiRef.current?.focus?.(leak, zoom);
  }, []);

  const locateMe = useCallback(() => {
    mapRef.current.locateMe?.(latestCoordsRef.current);
  }, []);

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
    locations,
    locationLabel,
    enabledLocations,
    activeProject,
    heatmapEnabled,
    nearbyOnly,
    nearbyRadius,
    nearbyRadiusOptions: NEARBY_RADIUS_OPTIONS,
    priorityFilters,
    statusFilters,
    hasGps: Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng),
    setHeatmapEnabled,
    setMonitoringFilter,
    setNearbyOnly,
    setNearbyRadius,
    togglePriorityFilter,
    clearPriorityFilters: () => setPriorityFilter([]),
    toggleStatusFilter,
    clearStatusFilters: () => setStatusFilter([]),
    toggleLocation,
    handleDownloadArea,
    handleExportKML,
    focusLeak,
    locateMe,
  };
}
