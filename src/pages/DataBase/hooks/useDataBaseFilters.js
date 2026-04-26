import { useState, useMemo } from "react";
import { STATUS, STATUS_ORDER } from "../../../utils/status";
import { filterNearbyLeaks } from "../../../utils/geoUtils";

export const ALL = "all";
export const NEARBY = "nearby";
export const NEARBY_RADIUS_M = 500;

const SEARCH_KEYS = [
  "leak_id",
  "object",
  "component",
  "location",
  "field",
  "leak_description",
];

export function useDataBaseFilters({ data, coords }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setFilter] = useState(ALL);
  const [priorityFilter, setPriorityFilter] = useState(ALL);
  const [sortAsc, setSortAsc] = useState(false);

  const hasGps = Boolean(coords?.lat && coords?.lng);

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

    if (statusFilter === NEARBY) {
      const base = hasGps
        ? filterNearbyLeaks(data, coords.lat, coords.lng, NEARBY_RADIUS_M)
        : [];
      return applySearch(applyPriority(base));
    }

    let list = [...data].sort((a, b) => (sortAsc ? a.id - b.id : b.id - a.id));
    if (statusFilter !== ALL)
      list = list.filter((l) => (l.status ?? STATUS.OPEN) === statusFilter);
    return applySearch(applyPriority(list));
  }, [data, statusFilter, priorityFilter, search, hasGps, coords, sortAsc]);

  const counts = useMemo(() => {
    const c = { all: data.length };
    STATUS_ORDER.forEach((st) => {
      c[st] = data.filter((l) => (l.status ?? STATUS.OPEN) === st).length;
    });
    c[NEARBY] = hasGps
      ? filterNearbyLeaks(data, coords.lat, coords.lng, NEARBY_RADIUS_M).length
      : 0;
    return c;
  }, [data, hasGps, coords]);

  return {
    search,
    setSearch,
    statusFilter,
    setFilter,
    priorityFilter,
    setPriorityFilter,
    sortAsc,
    toggleSort: () => setSortAsc((v) => !v),
    hasGps,
    displayed,
    counts,
  };
}
