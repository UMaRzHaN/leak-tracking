import { useEffect, useRef, useState } from "react";
import { updateMarkers, autoCenterMap } from "../services/mapService";

export const useLeaksMap = ({ leaks, mapApiRef }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const clustererRef = useRef(null);
  const userCoordsRef = useRef(null);

  const [mapReady, setMapReady] = useState(false);

  const userMarkerRef = useRef(null);
  const followUserRef = useRef(false);

  const locateMe = () => {
    if (!mapInstance.current || !userCoordsRef.current) return;

    followUserRef.current = true;

    mapInstance.current.panTo(userCoordsRef.current);
    mapInstance.current.setZoom(16);
  };

  /* ===== INIT MAP ===== */
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        userCoordsRef.current = coords;

        if (mapInstance.current) {
          if (!userMarkerRef.current) {
            userMarkerRef.current = new window.google.maps.Marker({
              map: mapInstance.current,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#1a73e8",
                fillOpacity: 1,
                strokeColor: "#fff",
                strokeWeight: 2,
              },
            });
          }

          userMarkerRef.current.setPosition(coords);

          if (followUserRef.current) {
            mapInstance.current.panTo(coords);
          }
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
          followUserRef.current = false; // 🔥 отключаем follow
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

  /* ===== MARKERS + AUTO CENTER ===== */
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
