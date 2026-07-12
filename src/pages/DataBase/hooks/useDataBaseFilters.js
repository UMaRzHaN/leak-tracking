import { useState, useMemo, useEffect } from "react";
import { STATUS, STATUS_ORDER } from "@/utils/status";
import { filterNearbyLeaks } from "@/utils/geoUtils";

export const ALL = "all";
export const NEARBY = "nearby";
export const NEARBY_RADIUS_M = 500;
export const NEARBY_RADIUS_OPTIONS = [100, 500, 1000];

const SEARCH_KEYS = [
  "leak_id",
  "object",
  "component",
  "location",
  "field",
  "leak_description",
];

export function useDataBaseFilters({ data, coords }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setFilter] = useState(ALL);
  const [priorityFilter, setPriorityFilter] = useState(ALL);
  const [nearbyFilter, setNearbyFilter] = useState(false);
  const [nearbyRadius, setNearbyRadius] = useState(NEARBY_RADIUS_M);
  const [sortAsc, setSortAsc] = useState(false);

  const hasGps = Boolean(coords?.lat && coords?.lng);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();

    const applySearch = (list) =>
      q
        ? list.filter((l) =>
            SEARCH_KEYS.some((k) =>
              String(l[k] ?? "")
                .toLowerCase()
                .includes(q),
            ),
          )
        : list;

    const applyPriority = (list) =>
      priorityFilter !== ALL
        ? list.filter((l) => (l.priority ?? null) === priorityFilter)
        : list;

    let list = [...data].sort((a, b) => (sortAsc ? a.id - b.id : b.id - a.id));
    if (statusFilter !== ALL)
      list = list.filter((l) => (l.status ?? STATUS.OPEN) === statusFilter);
    if (nearbyFilter && hasGps)
      list = filterNearbyLeaks(list, coords.lat, coords.lng, nearbyRadius);
    return applySearch(applyPriority(list));
  }, [
    data,
    statusFilter,
    nearbyFilter,
    nearbyRadius,
    priorityFilter,
    search,
    hasGps,
    coords,
    sortAsc,
  ]);

  const counts = useMemo(() => {
    const c = { all: data.length, [NEARBY]: 0 };
    STATUS_ORDER.forEach((st) => {
      c[st] = 0;
    });

    for (const l of data) {
      const st = l.status ?? STATUS.OPEN;
      if (c[st] !== undefined) c[st]++;
      if (hasGps) {
        const dlat = l.lat - coords.lat;
        const dlng = l.lng - coords.lng;
        // Fast equirectangular approximation sufficient for nearby radius checks.
        const approxM = Math.sqrt(dlat * dlat + dlng * dlng) * 111_320;
        if (approxM <= nearbyRadius) c[NEARBY]++;
      }
    }
    return c;
  }, [data, hasGps, coords, nearbyRadius]);

  return {
    search: searchInput,
    setSearch: setSearchInput,
    statusFilter,
    setFilter,
    priorityFilter,
    setPriorityFilter,
    nearbyFilter,
    setNearbyFilter,
    nearbyRadius,
    setNearbyRadius,
    nearbyRadiusOptions: NEARBY_RADIUS_OPTIONS,
    sortAsc,
    toggleSort: () => setSortAsc((v) => !v),
    hasGps,
    displayed,
    counts,
  };
}
