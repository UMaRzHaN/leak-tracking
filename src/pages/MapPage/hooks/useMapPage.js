import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { getDistanceMeters } from "@/utils/geoUtils";
import { STATUS } from "@/utils/status";
import { handleExport } from "@/pages/MapPage/handleExport";

const NEARBY_RADIUS_OPTIONS = [100, 500, 1000];

export function useMapPage({ leaks, coords }) {
  const { lang } = useLanguage();
  const { activeProject } = useProjectData();
  const exportProjectFolder = activeProject?.folderName;

  const mapApiRef = useRef(null);
  const mapModuleRef = useRef(null);
  const containerRef = useRef(null);
  const latestCoordsRef = useRef(coords);
  const initialCoordsRef = useRef(coords);
  const mapRef = useRef({
    map: null,
    markersLayer: null,
    locateMe: null,
    destroy: null,
  });
  const fittedRef = useRef(false);
  const distanceCacheRef = useRef(new Map());

  const {
    leaks: normalizedLeaks,
    locations,
    label: locationLabel,
  } = useActiveLocation(leaks);

  const [mapCenter, setMapCenter] = useState(null);
  const [open, setOpen] = useState(false);
  const [enabledLocations, setEnabledLocations] = useState({});
  const [notification, setNotification] = useState(null);
  const [tileProgress, setTileProgress] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [nearbyRadius, setNearbyRadius] = useState(500);
  const [priorityFilters, setPriorityFilters] = useState([]);
  const [statusFilters, setStatusFilters] = useState([]);

  const notify = useCallback(
    (type, message) => setNotification({ type, message }),
    [],
  );

  useEffect(() => {
    latestCoordsRef.current = coords;
  }, [coords]);

  useEffect(() => {
    setEnabledLocations((prev) => {
      const next = {};
      locations.forEach((location) => {
        next[location] = prev[location] ?? true;
      });
      return next;
    });
  }, [locations]);

  const toggleLocation = useCallback((location) => {
    setEnabledLocations((prev) => ({ ...prev, [location]: !prev[location] }));
  }, []);

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

  const togglePriorityFilter = useCallback((priority) => {
    setPriorityFilters((current) =>
      current.includes(priority)
        ? current.filter((item) => item !== priority)
        : [...current, priority],
    );
  }, []);

  const toggleStatusFilter = useCallback((status) => {
    setStatusFilters((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  }, []);

  const visibleLeaks = useMemo(() => {
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

      const { map, markersLayer, locateMe, destroy } =
        mapModule.createOfflineMap(container, {
          center: fallbackCenter,
          zoom: 13,
          initialUserCoords,
        });

      mapRef.current = { map, markersLayer, locateMe, destroy };
      setMapReady(true);

      invalidateFrame = requestAnimationFrame(() => {
        map.invalidateSize();
        invalidateTimeout = setTimeout(() => map.invalidateSize(), 250);
      });

      map.on("moveend", () => {
        const center = map.getCenter();
        setMapCenter({ lat: center.lat, lng: center.lng });
      });

      mapApiRef.current = {
        focus: (leak) => {
          if (!Number.isFinite(leak?.lat) || !Number.isFinite(leak?.lng)) {
            return;
          }
          map.setView([leak.lat, leak.lng], 16, { animate: true });
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
        destroy: null,
      };
      setMapReady(false);
      mapApiRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapModuleRef.current?.addMarkers?.(
      mapRef.current.markersLayer,
      visibleLeaks,
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

  const focusLeak = useCallback((leak) => {
    mapApiRef.current?.focus?.(leak);
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
    locations,
    locationLabel,
    enabledLocations,
    activeProject,
    nearbyOnly,
    nearbyRadius,
    nearbyRadiusOptions: NEARBY_RADIUS_OPTIONS,
    priorityFilters,
    statusFilters,
    hasGps: Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng),
    setNearbyOnly,
    setNearbyRadius,
    togglePriorityFilter,
    clearPriorityFilters: () => setPriorityFilters([]),
    toggleStatusFilter,
    clearStatusFilters: () => setStatusFilters([]),
    toggleLocation,
    handleDownloadArea,
    handleExportKML,
    focusLeak,
    locateMe,
  };
}
