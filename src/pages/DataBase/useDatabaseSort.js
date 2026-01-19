import { useState, useMemo } from "react";
import { getDistanceMeters } from "../../utils/getDistanceMeters";

export function useDatabaseSort(data, coords) {
  const [sortByDistance, setSortByDistance] = useState(false);

  const sortedData = useMemo(() => {
    if (!sortByDistance || !coords?.lat || !coords?.lon) return data;

    return [...data].sort((a, b) => {
      const da = getDistanceMeters(coords.lat, coords.lon, a.lat, a.lon);
      const db = getDistanceMeters(coords.lat, coords.lon, b.lat, b.lon);
      return da - db;
    });
  }, [data, sortByDistance, coords]);

  return { sortedData, sortByDistance, setSortByDistance };
}
