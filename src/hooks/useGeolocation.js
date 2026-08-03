import { useEffect, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";

const WEB_POSITION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 10000,
};

const NATIVE_POSITION_OPTIONS = {
  timeout: 60000,
  maximumAge: 15000,
  interval: 5000,
  minimumUpdateInterval: 3000,
  enableLocationFallback: true,
};

const NATIVE_RETRY_DELAY_MS = 3000;
const MAX_NATIVE_TIMEOUT_RETRIES = 1;

const getNativeErrorCode = (error) =>
  typeof error?.code === "string" ? error.code : "";

const isNativeTimeoutError = (error) =>
  getNativeErrorCode(error) === "OS-PLUG-GLOC-0010";

const getGeolocationErrorMessage = (error, retrying = false) => {
  switch (getNativeErrorCode(error)) {
    case "OS-PLUG-GLOC-0003":
      return "Доступ к геолокации запрещён";
    case "OS-PLUG-GLOC-0007":
      return "Геолокация на телефоне выключена";
    case "OS-PLUG-GLOC-0008":
      return "Использование геолокации ограничено системой";
    case "OS-PLUG-GLOC-0009":
      return "Включение геолокации отклонено";
    case "OS-PLUG-GLOC-0010":
      return retrying
        ? "GPS не успел определить координаты. Выполняется повторная попытка"
        : "GPS не смог определить координаты. Проверьте сигнал и повторите попытку";
    case "OS-PLUG-GLOC-0014":
      return "Требуется действие в настройках Google Play Services";
    case "OS-PLUG-GLOC-0015":
      return "Ошибка Google Play Services при определении координат";
    case "OS-PLUG-GLOC-0016":
      return "Настройки геолокации не позволяют получить координаты";
    case "OS-PLUG-GLOC-0017":
      return "Включите геолокацию или сеть на телефоне";
    default:
      return error?.message || "Не удалось получить координаты";
  }
};

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
      setCoords({ lat: null, lng: null });
      setError(null);
      setLoading(false);
      return;
    }

    let watchId = null;
    let stopped = false;
    let permStatus = null;
    let retryTimer = null;
    let nativeWatchGeneration = 0;
    let nativeTimeoutRetryCount = 0;
    let preciseLocationGranted = false;

    const clearPosition = () => {
      setCoords({ lat: null, lng: null });
    };

    const applyPosition = (position) => {
      nativeTimeoutRetryCount = 0;
      setCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      setError(null);
      setLoading(false);
    };

    const clearRetryTimer = () => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const clearWebWatch = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const clearNativeWatch = async (id = watchId) => {
      if (id === null) return;
      if (watchId === id) watchId = null;

      try {
        await Geolocation.clearWatch({ id });
      } catch (clearError) {
        logger.warn(
          "[useGeolocation] Failed to clear native watch:",
          clearError,
        );
      }
    };

    const startWebWatch = () => {
      setError(null);
      setLoading(true);

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (stopped) return;
          applyPosition(position);
        },
        (watchError) => {
          if (stopped) return;
          clearPosition();
          setError(watchError.message);
          setLoading(false);
        },
        WEB_POSITION_OPTIONS,
      );
    };

    const scheduleNativeTimeoutRetry = () => {
      if (
        stopped ||
        retryTimer !== null ||
        nativeTimeoutRetryCount >= MAX_NATIVE_TIMEOUT_RETRIES
      ) {
        return false;
      }

      nativeTimeoutRetryCount += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!stopped) void startNativeWatch();
      }, NATIVE_RETRY_DELAY_MS);
      return true;
    };

    async function startNativeWatch() {
      if (stopped) return;

      clearRetryTimer();
      setError(null);
      setLoading(true);

      const generation = ++nativeWatchGeneration;
      let registeredWatchId = null;

      try {
        registeredWatchId = await Geolocation.watchPosition(
          {
            ...NATIVE_POSITION_OPTIONS,
            enableHighAccuracy: preciseLocationGranted,
          },
          (position, watchError) => {
            if (stopped || generation !== nativeWatchGeneration) return;

            if (watchError) {
              nativeWatchGeneration += 1;

              const failedWatchId = registeredWatchId ?? watchId;
              if (failedWatchId !== null) {
                void clearNativeWatch(failedWatchId);
              }

              const retrying =
                isNativeTimeoutError(watchError) &&
                scheduleNativeTimeoutRetry();

              clearPosition();
              setError(getGeolocationErrorMessage(watchError, retrying));
              setLoading(false);
              return;
            }

            if (position) applyPosition(position);
          },
        );

        if (stopped || generation !== nativeWatchGeneration) {
          await clearNativeWatch(registeredWatchId);
          return;
        }

        watchId = registeredWatchId;
      } catch (watchError) {
        if (stopped || generation !== nativeWatchGeneration) return;

        const retrying =
          isNativeTimeoutError(watchError) && scheduleNativeTimeoutRetry();

        clearPosition();
        setError(getGeolocationErrorMessage(watchError, retrying));
        setLoading(false);
      }
    }

    const init = async () => {
      if (!isNative) {
        if (!navigator.geolocation) {
          setError("Браузер не поддерживает геолокацию");
          setLoading(false);
          return;
        }

        startWebWatch();

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
                clearWebWatch();
                startWebWatch();
              } else if (permStatus.state === "denied") {
                clearWebWatch();
                setError("Доступ к геолокации запрещён");
                setLoading(false);
              }
            };
          } catch (permissionsError) {
            logger.warn(
              "[useGeolocation] Permissions API unavailable:",
              permissionsError,
            );
          }
        }
        return;
      }

      try {
        const permissions = await Geolocation.requestPermissions();
        if (stopped) return;

        preciseLocationGranted = permissions.location === "granted";
        const coarseLocationGranted = permissions.coarseLocation === "granted";

        if (!preciseLocationGranted && !coarseLocationGranted) {
          clearPosition();
          setError("Нет разрешения на геолокацию");
          setLoading(false);
          return;
        }

        await startNativeWatch();
      } catch (permissionError) {
        if (stopped) return;
        clearPosition();
        setError(getGeolocationErrorMessage(permissionError));
        setLoading(false);
      }
    };

    void init();

    return () => {
      stopped = true;
      nativeWatchGeneration += 1;
      clearRetryTimer();

      if (permStatus) permStatus.onchange = null;

      if (!isNative) {
        clearWebWatch();
      } else if (watchId !== null) {
        void clearNativeWatch(watchId);
      }
    };
  }, [enabled]);

  return { coords, error, loading };
};
