import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDistanceMeters } from "../../../utils/geoUtils";
import { useActiveLocation } from "../../../hooks/useActiveLocation";
import { useProject } from "../../../app/settings/ProjectContext";
import { createOfflineMap, addMarkers } from "../../../services/maps/offlineMap";
import { preloadUrls, buildTileUrls, buildViewportTileUrls } from "../../../services/maps/tileCache";
import { saveLeaksKML } from "../../../services/export/kml";
import { handleExport } from "../../../utils/handleExport";

export function useMapPage({ leaks, coords }) {
  const { activeProject } = useProject();
  const exportProjectFolder = activeProject?.folderName;

  const mapApiRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef({ map: null, markersLayer: null, locateMe: null, destroy: null });
  const fittedRef = useRef(false);

  const { leaks: normalizedLeaks, locations, label: locationLabel } =
    useActiveLocation(leaks);

  const [mapCenter, setMapCenter] = useState(null);
  const [open, setOpen] = useState(false);
  const [enabledLocations, setEnabledLocations] = useState({});
  const [notification, setNotification] = useState(null);
  const [tileProgress, setTileProgress] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const notify = useCallback(
    (type, message) => setNotification({ type, message }),
    [],
  );

  useEffect(() => {
    setEnabledLocations((prev) => {
      const next = {};
      locations.forEach((loc) => { next[loc] = prev[loc] ?? true; });
      return next;
    });
  }, [locations]);

  const toggleLocation = useCallback((location) => {
    setEnabledLocations((prev) => ({ ...prev, [location]: !prev[location] }));
  }, []);

  const visibleLeaks = useMemo(() => {
    const filtered = normalizedLeaks.filter((l) => enabledLocations[l._location]);
    if (!mapCenter) return filtered;
    return filtered
      .map((l) => ({
        ...l,
        _distance: getDistanceMeters(mapCenter.lat, mapCenter.lng, l.lat, l.lng),
      }))
      .sort((a, b) => a._distance - b._distance);
  }, [normalizedLeaks, enabledLocations, mapCenter]);

  /* ── Map init ── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current.map) return;

    const fallbackCenter =
      Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng)
        ? [coords.lat, coords.lng]
        : [41.3111, 69.2797];

    const { map, markersLayer, locateMe, destroy } = createOfflineMap(container, {
      center: fallbackCenter,
      zoom: 13,
    });

    mapRef.current = { map, markersLayer, locateMe, destroy };

    map.on("moveend", () => {
      const c = map.getCenter();
      setMapCenter({ lat: c.lat, lng: c.lng });
    });

    mapApiRef.current = {
      focus: (leak) => {
        if (!Number.isFinite(leak?.lat) || !Number.isFinite(leak?.lng)) return;
        map.setView([leak.lat, leak.lng], 16, { animate: true });
      },
    };

    return () => {
      mapRef.current.map?.off("moveend");
      destroy();
      fittedRef.current = false;
      mapRef.current = { map: null, markersLayer: null, locateMe: null, destroy: null };
      mapApiRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Update markers + initial fitBounds ── */
  useEffect(() => {
    addMarkers(mapRef.current.markersLayer, visibleLeaks);

    if (fittedRef.current) return;
    const map = mapRef.current.map;
    if (!map) return;

    const valid = visibleLeaks.filter(
      (l) => Number.isFinite(l.lat) && Number.isFinite(l.lng),
    );
    if (valid.length === 0) return;

    fittedRef.current = true;
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], 15, { animate: false });
    } else {
      map.fitBounds(valid.map((l) => [l.lat, l.lng]), {
        padding: [40, 40],
        maxZoom: 16,
        animate: false,
      });
    }
  }, [visibleLeaks]);

  /* ── Download tiles ── */
  const handleDownloadArea = useCallback(async () => {
    const map = mapRef.current.map;
    if (!map || downloading) return;

    setDownloading(true);
    try {
      const urlSet = new Set();

      const valid = visibleLeaks.filter(
        (l) => Number.isFinite(l.lat) && Number.isFinite(l.lng),
      );
      const n = 2 ** 14;
      const seen = new Set();
      const unique = valid.filter(({ lat, lng }) => {
        const tx = Math.floor(((lng + 180) / 360) * n);
        const latRad = (lat * Math.PI) / 180;
        const ty = Math.floor(
          ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
        );
        const key = `${tx}:${ty}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      for (const pt of unique) {
        for (const url of buildTileUrls(pt.lat, pt.lng, 13, 13)) urlSet.add(url);
      }

      const b = map.getBounds();
      const bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      };
      const currentZoom = Math.floor(map.getZoom());
      for (const url of buildViewportTileUrls(bounds, currentZoom, currentZoom)) {
        urlSet.add(url);
      }

      const urls = [...urlSet];
      if (urls.length === 0) { notify("error", "Нет тайлов для скачивания"); return; }

      setTileProgress({ done: 0, total: urls.length, status: null });
      await preloadUrls(urls, {
        onProgress: (done, total) => setTileProgress({ done, total, status: null }),
      });
      setTileProgress({ done: urls.length, total: urls.length, status: "success" });
    } catch {
      setTileProgress({ done: 0, total: 0, status: "error" });
    } finally {
      setDownloading(false);
      setTimeout(() => setTileProgress(null), 2500);
    }
  }, [downloading, visibleLeaks, notify]);

  /* ── KML export ── */
  const handleExportKML = useCallback(() => {
    handleExport({
      leaks: visibleLeaks,
      saveFn: () => saveLeaksKML(visibleLeaks, activeProject?.type, exportProjectFolder),
      onSuccess: (result) =>
        notify("success", result?.message || "KML-файл успешно экспортирован"),
      onError: (message) => notify("error", message),
    });
  }, [visibleLeaks, activeProject, exportProjectFolder, notify]);

  const focusLeak = useCallback((leak) => {
    mapApiRef.current?.focus?.(leak);
  }, []);

  const locateMe = useCallback(() => {
    mapRef.current.locateMe?.();
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
    toggleLocation,
    handleDownloadArea,
    handleExportKML,
    focusLeak,
    locateMe,
  };
}
