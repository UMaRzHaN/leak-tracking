import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export const useGeolocation = (enabled = true) => {
  const [coords, setCoords] = useState({ lat: null, lon: null });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let watchId = null;
    let stopped = false;

    const startWatch = async () => {
      try {
        // 🌐 WEB
        if (!Capacitor.isNativePlatform()) {
          if (!navigator.geolocation) {
            throw new Error("Браузер не поддерживает геолокацию");
          }

          watchId = navigator.geolocation.watchPosition(
            (pos) => {
              if (stopped) return;
              setCoords({
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
              });
              setLoading(false);
            },
            (err) => {
              if (stopped) return;
              setError(err.message);
              setLoading(false);
            },
            {
              enableHighAccuracy: true,
              maximumAge: 1000,
              timeout: 10000,
            }
          );
          return;
        }

        // 📱 MOBILE
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== "granted") {
          throw new Error("Нет разрешения на геолокацию");
        }

        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true },
          (pos, err) => {
            if (stopped) return;

            if (err) {
              setError(err.message);
              setLoading(false);
              return;
            }

            if (pos) {
              setCoords({
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
              });
              setLoading(false);
            }
          }
        );
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    };

    startWatch();

    return () => {
      stopped = true;

      if (!Capacitor.isNativePlatform()) {
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
        }
      } else {
        if (watchId !== null) {
          Geolocation.clearWatch({ id: watchId });
        }
      }
    };
  }, [enabled]);

  return { coords, error, loading };
};
