import { useEffect, useRef, useState } from "react";
import { updateMarkers, autoCenterMap } from "../services/mapService";

export const useLeaksMap = ({ leaks, mapApiRef, onMoveEnd }) => {
  const mapRef = useRef(null);
  const mapRefInstance = useRef(null);

  const markersRef = useRef([]);
  const clustererRef = useRef(null);

  const userCoordsRef = useRef(null);
  const userMarkerRef = useRef(null);

  const followUserRef = useRef(false);
  const userMovedRef = useRef(false);
  const lastCenterRef = useRef(null);

  const [mapReady, setMapReady] = useState(false);

  /* ======================================================
     LOCATE ME
     ====================================================== */
  const locateMe = () => {
    if (!mapRefInstance.current || !userCoordsRef.current) return;

    followUserRef.current = true;
    userMovedRef.current = true;

    mapRefInstance.current.panTo(userCoordsRef.current);
    mapRefInstance.current.setZoom(15);
  };

  /* ======================================================
     GEOLOCATION + USER MARKER
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
        if (!mapRefInstance.current) return;

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
            map: mapRefInstance.current,
            position: coords,
            content: el,
            zIndex: 9999,
          });
        } else {
          userMarkerRef.current.position = coords;
        }

        if (followUserRef.current) {
          mapRefInstance.current.panTo(coords);
          mapRefInstance.current.setZoom(15);
          followUserRef.current = false; // 🔥
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
    let destroyed = false;

    const initMap = async () => {
      if (!mapRef.current) return;
      if (!window.google?.maps) {
        console.error("Google Maps SDK not loaded");
        return;
      }

      const { Map } = await window.google.maps.importLibrary("maps");
      const listeners = [];
      if (destroyed) return;

      const map = new Map(mapRef.current, {
        center: { lat: 41.3111, lng: 69.2797 },
        zoom: 12,
        mapTypeId: "hybrid",
        mapId: "f1754e62f5aea817edc5ba25",
        fullscreenControl: false,
        rotateControl: false,
        streetViewControl: false,
        mapTypeControl: true,
        zoomControl: true,
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_TOP,
        },
      });

      mapRefInstance.current = map;

      /* ===== USER INTERACTION ===== */
      listeners.push(
        map.addListener("dragstart", () => {
          followUserRef.current = false;
          userMovedRef.current = true;
        }),
      );

      map.addListener("zoom_changed", () => {
        followUserRef.current = false;
        userMovedRef.current = true;
      });

      /* ===== EMIT CENTER ===== */
      const emitCenter = () => {
        const c = map.getCenter();
        if (!c) return;

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

      map.addListener("idle", emitCenter);

      /* ===== MAP API ===== */
      mapApiRef.current = {
        focus(leak) {
          if (!leak) return;

          followUserRef.current = false;
          userMovedRef.current = true;

          map.panTo({
            lat: Number(leak.lat),
            lng: Number(leak.lon),
          });
          map.setZoom(16);
        },
      };

      emitCenter();
      setMapReady(true);
    };

    initMap();

    return () => {
      destroyed = true;
    };
  }, [mapApiRef, onMoveEnd]);

  /* ======================================================
     MARKERS + AUTO CENTER
     ====================================================== */
  useEffect(() => {
    const map = mapRefInstance.current;
    if (!mapReady || !map) return;

    updateMarkers({
      map,
      leaks,
      markersRef,
      clustererRef,
    });

    if (!userMovedRef.current) {
      autoCenterMap({
        map,
        leaks,
        userCoords: userCoordsRef.current,
      });
    }
  }, [mapReady, leaks]);

  return {
    mapRef,
    locateMe,
  };
};
