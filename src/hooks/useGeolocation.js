import { useState, useEffect } from "react";
import { getCurrentLocation } from "../services/geolocationService";

export const useGeolocation = () => {
  const [coords, setCoords] = useState({ lat: null, lon: null });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    getCurrentLocation()
      .then((c) => mounted && setCoords(c))
      .catch((e) => mounted && setError(e.message))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  return { coords, error, loading };
};
