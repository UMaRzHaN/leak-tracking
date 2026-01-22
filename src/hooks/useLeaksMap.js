import { useEffect, useRef, useState } from "react";
import { updateMarkers, autoCenterMap } from "../services/mapService";

export const useLeaksMap = ({ leaks, mapApiRef, onMoveEnd }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  const markersRef = useRef([]);
  const clustererRef = useRef(null);
  const autoCenteredRef = useRef(false);
  const userCoordsRef = useRef(null);
  const userMarkerRef = useRef(null);
  const followUserRef = useRef(false);
  const lastCenterRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  /* ===== LOCATE ME ===== */
  const locateMe = () => {
    if (!mapInstance.current || !userCoordsRef.current) return;
    followUserRef.current = true;
    mapInstance.current.panTo(userCoordsRef.current);
    mapInstance.current.setZoom(12);
  };
  /* ======================================================
     GEOLOCATION + USER MARKER (AdvancedMarker)
     ====================================================== */
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        userCoordsRef.current = coords;

        if (!mapInstance.current) return;

        // лениво импортируем marker lib
        const { AdvancedMarkerElement } =
          await window.google.maps.importLibrary("marker");

        if (!userMarkerRef.current) {
          const el = document.createElement("div");
          el.style.width = "14px";
          el.style.height = "14px";
          el.style.borderRadius = "50%";
          el.style.background = "#1a73e8";
          el.style.border = "2px solid #fff";
          el.style.boxShadow = "0 0 6px rgba(0,0,0,0.3)";

          userMarkerRef.current = new AdvancedMarkerElement({
            map: mapInstance.current,
            position: coords,
            content: el,
            zIndex: 9999,
          });
        } else {
          userMarkerRef.current.position = coords;
        }

        if (followUserRef.current) {
          mapInstance.current.panTo(coords);
        }
      },
      console.error,
      {
        enableHighAccuracy: false,
        maximumAge: 30000,
        timeout: 10000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  /* ======================================================
     INIT MAP
     ====================================================== */
useEffect(() => {
  let cancelled = false;

  async function initMap() {
    if (!mapRef.current) return;

    // ⛔ Google Maps уже загружен через <script>
    if (!window.google?.maps) {
      console.error("Google Maps SDK not loaded");
      return;
    }

    const { Map } = await window.google.maps.importLibrary("maps");
    if (cancelled) return;

    mapInstance.current = new Map(mapRef.current, {
      center: { lat: 41.3111, lng: 69.2797 },
      zoom: 12,
      mapTypeId: "hybrid",
      mapId: "f1754e62f5aea817edc5ba25",
      fullscreenControl: false,
      rotateControl: false,
      zoomControl: true,
      zoomControlOptions: {
        position: window.google.maps.ControlPosition.RIGHT_TOP,
      },
      streetViewControl: false,
      mapTypeControl: true,
    });

    /* ===== EMIT CENTER ===== */
    const emitCenter = () => {
      const c = mapInstance.current.getCenter();
      const next = { lat: c.lat(), lng: c.lng() };

      if (
        lastCenterRef.current &&
        Math.abs(lastCenterRef.current.lat - next.lat) < 1e-6 &&
        Math.abs(lastCenterRef.current.lng - next.lng) < 1e-6
      ) {
        return;
      }

      lastCenterRef.current = next;
      onMoveEnd?.(next);
    };

    mapInstance.current.addListener("dragstart", () => {
      followUserRef.current = false;
    });

    mapInstance.current.addListener("zoom_changed", () => {
      followUserRef.current = false;
    });

    mapInstance.current.addListener("idle", emitCenter);

    mapApiRef.current = {
      focus(leak) {
        followUserRef.current = false;
        mapInstance.current.panTo({
          lat: Number(leak.lat),
          lng: Number(leak.lon),
        });
        mapInstance.current.setZoom(14);
      },
    };

    emitCenter();
    setMapReady(true);
  }

  initMap();
  return () => {
    cancelled = true;
  };
}, [mapApiRef, onMoveEnd]);

  /* ======================================================
     LEAK MARKERS + AUTO CENTER
     ====================================================== */
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;

    updateMarkers({
      map: mapInstance.current,
      leaks,
      markersRef,
      clustererRef,
    });

    if (!autoCenteredRef.current && leaks.length) {
      autoCenterMap({
        map: mapInstance.current,
        leaks,
      });
      autoCenteredRef.current = true;
    }
  }, [mapReady, leaks]);

  return { mapRef, locateMe };
};
