import { useEffect, useRef, useState } from "react";
import { updateMarkers, autoCenterMap } from "../services/mapService";

export const useLeaksMap = ({ leaks, mapApiRef }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  const markersRef = useRef([]);
  const clustererRef = useRef(null);

  const userCoordsRef = useRef(null);
  const userMarkerRef = useRef(null);
  const followUserRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);

  /* ===== LOCATE ME ===== */
  const locateMe = () => {
    if (!mapInstance.current || !userCoordsRef.current) return;

    followUserRef.current = true;
    mapInstance.current.panTo(userCoordsRef.current);
    mapInstance.current.setZoom(16);
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

      while (!window.google || !window.google.maps) {
        await new Promise((r) => setTimeout(r, 50));
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
        mapTypeControl: false,
      });

      mapInstance.current.addListener("dragstart", () => {
        followUserRef.current = false;
      });

      mapInstance.current.addListener("zoom_changed", () => {
        followUserRef.current = false;
      });

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

      setMapReady(true);
    }

    initMap();
    return () => {
      cancelled = true;
    };
  }, [mapApiRef]);

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

    if (!followUserRef.current) {
      autoCenterMap({
        map: mapInstance.current,
        leaks,
      });
    }
  }, [mapReady, leaks]);

  return { mapRef, locateMe };
};
