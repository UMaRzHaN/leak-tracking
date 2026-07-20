import { useState, useMemo, useEffect } from "react";
import { STATUS, STATUS_ORDER } from "@/utils/status";
import { filterNearbyLeaks } from "@/utils/geoUtils";

export const ALL = "all";
export const NEARBY = "nearby";
export const NEARBY_RADIUS_M = 500;
export const NEARBY_RADIUS_OPTIONS = [100, 500, 1000];

export function normalizeMultiFilter(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== ALL);
  return value && value !== ALL ? [value] : [];
}

const SEARCH_KEYS = [
  "leak_id",
  "object",
  "component",
  "location",
  "field",
  "leak_description",
];

export function useDataBaseFilters({ data, coords, sharedFilters = null }) {
  const [localSearchInput, setLocalSearchInput] = useState("");
  const [search, setSearch] = useState(() => sharedFilters?.search ?? "");
  const [localStatusFilter, setLocalStatusFilter] = useState([]);
  const [localPriorityFilter, setLocalPriorityFilter] = useState([]);
  const [localNearbyFilter, setLocalNearbyFilter] = useState(false);
  const [localNearbyRadius, setLocalNearbyRadius] = useState(NEARBY_RADIUS_M);
  const [sortAsc, setSortAsc] = useState(false);

  const searchInput = sharedFilters?.search ?? localSearchInput;
  const setSearchInput = sharedFilters?.setSearch ?? setLocalSearchInput;
  const statusFilter = normalizeMultiFilter(
    sharedFilters?.statusFilter ?? localStatusFilter,
  );
  const setFilter = sharedFilters?.setFilter ?? setLocalStatusFilter;
  const priorityFilter = normalizeMultiFilter(
    sharedFilters?.priorityFilter ?? localPriorityFilter,
  );
  const setPriorityFilter =
    sharedFilters?.setPriorityFilter ?? setLocalPriorityFilter;
  const nearbyFilter = sharedFilters?.nearbyFilter ?? localNearbyFilter;
  const setNearbyFilter =
    sharedFilters?.setNearbyFilter ?? setLocalNearbyFilter;
  const nearbyRadius = sharedFilters?.nearbyRadius ?? localNearbyRadius;
  const setNearbyRadius =
    sharedFilters?.setNearbyRadius ?? setLocalNearbyRadius;

  const hasGps = Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng);

  useEffect(() => {
    if (searchInput === search) return undefined;
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [search, searchInput]);

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
      priorityFilter.length > 0
        ? list.filter((l) => priorityFilter.includes(l.priority ?? null))
        : list;

    let list = [...data].sort((a, b) => (sortAsc ? a.id - b.id : b.id - a.id));
    if (statusFilter.length > 0)
      list = list.filter((l) => statusFilter.includes(l.status ?? STATUS.OPEN));
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
