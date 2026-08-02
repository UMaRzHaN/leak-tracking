import { useEffect, useState } from "react";
import { isNative } from "@/utils/platform";
import { Geolocation } from "@capacitor/geolocation";
import { logger } from "@/utils/logger";

export const useGeolocation = (enabled = true) => {
  const [coords, setCoords] = useState(
    /** @type {{lat: number | null, lng: number | null, accuracy?: number, heading?: number | null}} */ ({
      lat: null,
      lng: null,
    }),
  );
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      // A disabled GPS control must not leave the last fix looking current.
      // Consumers use these coordinates for new leak records and proximity
      // filters, so retaining them would silently reuse a stale location.
      setCoords({ lat: null, lng: null });
      setError(null);
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
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
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
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
      );
    };

    const init = async () => {
      // WEB
      if (!isNative) {
        if (!navigator.geolocation) {
          setError("Браузер не поддерживает геолокацию");
          setLoading(false);
          return;
        }

        startWebWatch();

        // Follow permission changes so GPS watch can recover without reloading.
        if (navigator.permissions) {
          try {
            const status = await navigator.permissions.query({
              name: "geolocation",
            });
            if (stopped) {
              status.onchange = null;
              return;
            }
            permStatus = status;
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
          } catch (err) {
            // Permissions API not available in this browser - expected on some mobile webviews
            logger.warn("[useGeolocation] Permissions API unavailable:", err);
          }
        }
        return;
      }

      // MOBILE
      try {
        const perm = await Geolocation.requestPermissions();
        if (stopped) return;
        if (perm.location !== "granted") {
          throw new Error("Нет разрешения на геолокацию");
        }

        const registeredWatchId = await Geolocation.watchPosition(
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
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
              setError(null);
              setLoading(false);
            }
          },
        );
        if (stopped) {
          await Geolocation.clearWatch({ id: registeredWatchId }).catch(
            (error) =>
              logger.warn(
                "[useGeolocation] Failed to clear late watch:",
                error,
              ),
          );
          return;
        }
        watchId = registeredWatchId;
      } catch (e) {
        if (stopped) return;
        setError(e.message);
        setLoading(false);
      }
    };

    init();

    return () => {
      stopped = true;
      if (permStatus) permStatus.onchange = null;

      if (!isNative) {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      } else {
        if (watchId !== null) {
          Geolocation.clearWatch({ id: watchId }).catch((error) =>
            logger.warn("[useGeolocation] Failed to clear watch:", error),
          );
        }
      }
    };
  }, [enabled]);

  return { coords, error, loading };
};
