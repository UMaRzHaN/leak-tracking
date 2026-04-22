import { useState, useCallback } from "react";
import { useGeolocation } from "../../hooks/useGeolocation";

export function useAppState() {
  const [{ page, prevPage }, setPageState] = useState({ page: "", prevPage: "" });
  const [data, setData] = useState([]);
  const [gpsEnabled, setGpsEnabled] = useState(true);

  const setPage = useCallback((next) => {
    setPageState(({ page: current }) => ({ page: next, prevPage: current }));
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
    data,
    setData,
    gpsEnabled,
    setGpsEnabled,
    coords,
    geoError,
    geoLoading,
  };
}
