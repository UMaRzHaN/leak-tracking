import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export const useGeolocation = (enabled = true) => {
  const [coords, setCoords] = useState({ lat: null, lng: null });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let watchId = null;
    let stopped = false;
    let permStatus = null;

    const clearCurrentWatch = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const startWebWatch = () => {
      setError(null);
      setLoading(true);

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (stopped) return;
          setCoords({
            lat:      pos.coords.latitude,
            lng:      pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
          setError(null);
          setLoading(false);
        },
        (err) => {
          if (stopped) return;
          setError(err.message);
          setLoading(false);
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      );
    };

    const init = async () => {
      // 🌐 WEB
      if (!Capacitor.isNativePlatform()) {
        if (!navigator.geolocation) {
          setError("Браузер не поддерживает геолокацию");
          setLoading(false);
          return;
        }

        startWebWatch();

        // Следим за изменением разрешения — когда пользователь разрешает GPS
        // в настройках браузера, перезапускаем watchPosition без перезагрузки страницы
        if (navigator.permissions) {
          try {
            permStatus = await navigator.permissions.query({ name: "geolocation" });
            permStatus.onchange = () => {
              if (stopped) return;
              if (permStatus.state === "granted") {
                clearCurrentWatch();
                startWebWatch();
              } else if (permStatus.state === "denied") {
                clearCurrentWatch();
                setError("Доступ к геолокации запрещён");
                setLoading(false);
              }
            };
          } catch (_) {
            // Permissions API недоступен в данном браузере — молча игнорируем
          }
        }
        return;
      }

      // 📱 MOBILE
      try {
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
                lat:      pos.coords.latitude,
                lng:      pos.coords.longitude,
                accuracy: pos.coords.accuracy,
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

    init();

    return () => {
      stopped = true;
      if (permStatus) permStatus.onchange = null;

      if (!Capacitor.isNativePlatform()) {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      } else {
        if (watchId !== null) Geolocation.clearWatch({ id: watchId });
      }
    };
  }, [enabled]);

  return { coords, error, loading };
};
