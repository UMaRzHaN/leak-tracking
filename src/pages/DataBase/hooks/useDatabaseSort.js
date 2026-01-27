import { useState, useMemo } from "react";
import { getDistanceMeters } from "../../../utils/calculations/getDistanceMeters";

export function useDatabaseSort(data, coords) {
  const [sortByDistance, setSortByDistance] = useState(false);

  const sortedData = useMemo(() => {
    if (!sortByDistance || !coords?.lat || !coords?.lng) return data;

    return [...data].sort((a, b) => {
      const da = getDistanceMeters(coords.lat, coords.lng, a.lat, a.lng);
      const db = getDistanceMeters(coords.lat, coords.lng, b.lat, b.lng);
      return da - db;
    });
  }, [data, sortByDistance, coords]);

  return { sortedData, sortByDistance, setSortByDistance };
}
