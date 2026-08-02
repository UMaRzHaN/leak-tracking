import { useState, useCallback, useEffect, useRef } from "react";
import { useGeolocation } from "@/hooks/useGeolocation";

const NAVIGATION_STATE_KEY = "leakTrackingNavigation";
const GPS_ENABLED_KEY = "app:gps_enabled_v1";
const HOME_PAGE = "";
const APP_PAGES = new Set([
  HOME_PAGE,
  "add",
  "db",
  "map",
  "monitoring",
  "settings",
]);

function normalizePage(value) {
  return typeof value === "string" && APP_PAGES.has(value) ? value : HOME_PAGE;
}

function readNavigationState(state = globalThis.history?.state) {
  const navigation = state?.[NAVIGATION_STATE_KEY];
  if (
    !navigation ||
    typeof navigation.page !== "string" ||
    !APP_PAGES.has(navigation.page)
  ) {
    return null;
  }
  return {
    page: navigation.page,
    depth:
      Number.isInteger(navigation.depth) && navigation.depth >= 0
        ? navigation.depth
        : 0,
  };
}

function writeNavigationState(navigation, replace = false) {
  if (!globalThis.history) return;
  const state = {
    ...(globalThis.history.state ?? {}),
    [NAVIGATION_STATE_KEY]: navigation,
  };
  const method = replace ? "replaceState" : "pushState";
  globalThis.history[method](state, "");
}

function readGpsPreference() {
  try {
    return localStorage.getItem(GPS_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function useAppState() {
  const initialNavigationRef = useRef(
    readNavigationState() ?? { page: HOME_PAGE, depth: 0 },
  );
  const navigationRef = useRef(initialNavigationRef.current);
  const [pageState, setPageState] = useState({
    page: initialNavigationRef.current.page,
    prevPage: HOME_PAGE,
  });
  const { page, prevPage } = pageState;
  const [gpsEnabled, setGpsEnabled] = useState(readGpsPreference);
  const updateGpsEnabled = useCallback((next) => {
    setGpsEnabled((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      const enabled = resolved === true;
      try {
        localStorage.setItem(GPS_ENABLED_KEY, String(enabled));
      } catch {
        // The in-memory opt-in remains usable when browser storage is blocked.
      }
      return enabled;
    });
  }, []);

  useEffect(() => {
    if (!readNavigationState()) {
      writeNavigationState(navigationRef.current, true);
    }

    const handlePopState = (event) => {
      const current = navigationRef.current;
      const next = readNavigationState(event.state) ?? {
        page: HOME_PAGE,
        depth: 0,
      };
      navigationRef.current = next;
      setPageState({ page: next.page, prevPage: current.page });
    };

    globalThis.addEventListener?.("popstate", handlePopState);
    return () => globalThis.removeEventListener?.("popstate", handlePopState);
  }, []);

  const setPage = useCallback((next, { replace = false } = {}) => {
    const nextPage = normalizePage(next);
    const current = navigationRef.current;
    if (current.page === nextPage) return;

    const navigation = {
      page: nextPage,
      depth: replace ? current.depth : current.depth + 1,
    };
    writeNavigationState(navigation, replace);
    navigationRef.current = navigation;
    setPageState({ page: nextPage, prevPage: current.page });
  }, []);

  const goBack = useCallback((fallback = HOME_PAGE) => {
    const current = navigationRef.current;
    if (current.depth > 0 && globalThis.history) {
      globalThis.history.back();
      return;
    }

    const navigation = { page: normalizePage(fallback), depth: 0 };
    writeNavigationState(navigation, true);
    navigationRef.current = navigation;
    setPageState({ page: navigation.page, prevPage: current.page });
  }, []);

  const {
    coords,
    error: geoError,
    loading: geoLoading,
  } = useGeolocation(gpsEnabled);

  return {
    page,
    prevPage,
    setPage,
    goBack,
    gpsEnabled,
    setGpsEnabled: updateGpsEnabled,
    coords,
    geoError,
    geoLoading,
  };
}
