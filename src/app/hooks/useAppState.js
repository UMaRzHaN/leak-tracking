import { useState } from "react";
import { useGeolocation } from "../../hooks/useGeolocation";

export function useAppState() {
  const [page, setPage] = useState("");
  const [data, setData] = useState([]);
  const [gpsEnabled, setGpsEnabled] = useState(true);

  const {
    coords,
    error: geoError,
    loading: geoLoading,
  } = useGeolocation(gpsEnabled);

  return {
    page,
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
