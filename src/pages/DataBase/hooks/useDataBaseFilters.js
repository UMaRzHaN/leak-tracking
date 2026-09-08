import { useState, useMemo, useEffect } from "react";
import { STATUS, STATUS_ORDER } from "@/utils/status";
import { distanceMeters, filterNearbyLeaks } from "@/utils/geoUtils";
import { matchesLeakLocationFilter } from "@/utils/locationFilter";
import { compareLeakRecency } from "@/utils/leakOrder";

export const ALL = "all";
import { NEARBY, NEARBY_RADIUS_M } from "@/domain/leakFilters";

export const NEARBY_RADIUS_OPTIONS = [100, 500, 1000];

import {
  buildLeakSearchText,
  matchesLeakSearch,
  normalizeLeakSearchText,
} from "./leakSearchText";

export { buildLeakSearchText, matchesLeakSearch, normalizeLeakSearchText };

export function normalizeMultiFilter(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== ALL);
  return value && value !== ALL ? [value] : [];
}

export function useDataBaseFilters({
  data,
  coords,
  sharedFilters = /** @type {any} */ (null),
  configuredMainLocationKey = /** @type {string|null} */ (null),
  configuredLocationKey = /** @type {string|null} */ (null),
  configuredLastLocationKey = /** @type {string|null} */ (null),
}) {
  const [localSearchInput, setLocalSearchInput] = useState("");
  const [search, setSearch] = useState(() => sharedFilters?.search ?? "");
  const [localStatusFilter, setLocalStatusFilter] = useState(
    /** @type {string[]} */ ([]),
  );
  const [localPriorityFilter, setLocalPriorityFilter] = useState(
    /** @type {string[]} */ ([]),
  );
  const [localMainLocationFilter, setLocalMainLocationFilter] = useState(
    /** @type {string|null} */ (null),
  );
  const [localLocationFilter, setLocalLocationFilter] = useState(
    /** @type {string|null} */ (null),
  );
  const [localLastLocationFilter, setLocalLastLocationFilter] = useState(
    /** @type {string|null} */ (null),
  );
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
  const hasSharedMainLocationFilter =
    typeof sharedFilters?.setMainLocationFilter === "function";
  const mainLocationFilter = hasSharedMainLocationFilter
    ? (sharedFilters.mainLocationFilter ?? null)
    : localMainLocationFilter;
  const setMainLocationFilter = hasSharedMainLocationFilter
    ? sharedFilters.setMainLocationFilter
    : setLocalMainLocationFilter;
  const hasSharedLocationFilter =
    typeof sharedFilters?.setLocationFilter === "function";
  const locationFilter = hasSharedLocationFilter
    ? (sharedFilters.locationFilter ?? null)
    : localLocationFilter;
  const setLocationFilter = hasSharedLocationFilter
    ? sharedFilters.setLocationFilter
    : setLocalLocationFilter;
  const hasSharedLastLocationFilter =
    typeof sharedFilters?.setLastLocationFilter === "function";
  const lastLocationFilter = hasSharedLastLocationFilter
    ? (sharedFilters.lastLocationFilter ?? null)
    : localLastLocationFilter;
  const setLastLocationFilter = hasSharedLastLocationFilter
    ? sharedFilters.setLastLocationFilter
    : setLocalLastLocationFilter;
  const nearbyFilter = sharedFilters?.nearbyFilter ?? localNearbyFilter;
  const setNearbyFilter =
    sharedFilters?.setNearbyFilter ?? setLocalNearbyFilter;
  const nearbyRadius = sharedFilters?.nearbyRadius ?? localNearbyRadius;
  const setNearbyRadius =
    sharedFilters?.setNearbyRadius ?? setLocalNearbyRadius;

  const locationKey = useMemo(() => {
    if (configuredLocationKey) return configuredLocationKey;
    if (locationFilter?.key) return locationFilter.key;
    return ["deposit", "station", "locality"].find((key) =>
      data.some((leak) => String(leak?.[key] ?? "").trim()),
    );
  }, [configuredLocationKey, data, locationFilter?.key]);

  const locationOptions = useMemo(() => {
    if (!locationKey) return [];
    const values = new Set(
      data.map((leak) => String(leak?.[locationKey] ?? "").trim()),
    );
    if (locationFilter?.key === locationKey) {
      for (const value of locationFilter.values ?? []) {
        values.add(String(value).trim());
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [data, locationFilter, locationKey]);

  const mainLocationKey = useMemo(() => {
    if (configuredMainLocationKey) return configuredMainLocationKey;
    return mainLocationFilter?.key;
  }, [configuredMainLocationKey, mainLocationFilter?.key]);

  const mainLocationOptions = useMemo(() => {
    if (!mainLocationKey) return [];
    const values = new Set(
      data.map((leak) => String(leak?.[mainLocationKey] ?? "").trim()),
    );
    if (mainLocationFilter?.key === mainLocationKey) {
      for (const value of mainLocationFilter.values ?? []) {
        values.add(String(value).trim());
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [data, mainLocationFilter, mainLocationKey]);

  const hasGps = Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng);

  useEffect(() => {
    if (searchInput === search) return undefined;
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [search, searchInput]);

  const searchTokens = useMemo(
    () => normalizeLeakSearchText(search).split(" ").filter(Boolean),
    [search],
  );
  const searchIndex = useMemo(() => {
    if (searchTokens.length === 0) return null;
    return new Map(data.map((leak) => [leak, buildLeakSearchText(leak)]));
  }, [data, searchTokens.length]);

  // Счётчики и список должны видеть одну и ту же выборку, поэтому отбор по
  // месту, поиску и приоритету вынесен отдельно: статус применяется только к
  // списку, а счётчики строятся уже на суженном наборе.
  const scoped = useMemo(() => {
    const applySearch = (list) =>
      searchTokens.length > 0
        ? list.filter((leak) =>
            searchTokens.every((token) =>
              searchIndex?.get(leak)?.includes(token),
            ),
          )
        : list;

    const applyPriority = (list) =>
      priorityFilter.length > 0
        ? list.filter((l) => priorityFilter.includes(l.priority ?? null))
        : list;

    const applyLocation = (list) =>
      locationFilter?.key === locationKey
        ? list.filter((leak) => matchesLeakLocationFilter(leak, locationFilter))
        : list;

    const applyMainLocation = (list) =>
      mainLocationFilter?.key === mainLocationKey
        ? list.filter((leak) =>
            matchesLeakLocationFilter(leak, mainLocationFilter),
          )
        : list;

    // The third level has no checkbox list of its own — it is set by the
    // location browser — so it is keyed off the project config alone.
    const applyLastLocation = (list) =>
      lastLocationFilter?.key === configuredLastLocationKey
        ? list.filter((leak) =>
            matchesLeakLocationFilter(leak, lastLocationFilter),
          )
        : list;

    return applySearch(
      applyPriority(applyLastLocation(applyLocation(applyMainLocation(data)))),
    );
  }, [
    data,
    priorityFilter,
    mainLocationFilter,
    mainLocationKey,
    locationFilter,
    locationKey,
    lastLocationFilter,
    configuredLastLocationKey,
    searchIndex,
    searchTokens,
  ]);

  const displayed = useMemo(() => {
    // The toggle above this list is labelled "date", and it sorted by
    // `compareLeakIds` — the record id. Imported records carry a numeric id and
    // came out roughly by age, which hid it; anything added in the app gets a
    // random UUID, so the control promised dates and delivered noise.
    let list = [...scoped].sort((a, b) =>
      sortAsc ? compareLeakRecency(b, a) : compareLeakRecency(a, b),
    );
    if (statusFilter.length > 0)
      list = list.filter((l) => statusFilter.includes(l.status ?? STATUS.OPEN));
    if (nearbyFilter && hasGps)
      list = filterNearbyLeaks(list, coords.lat, coords.lng, nearbyRadius);
    return list;
  }, [
    scoped,
    statusFilter,
    nearbyFilter,
    nearbyRadius,
    hasGps,
    coords,
    sortAsc,
  ]);

  const counts = useMemo(() => {
    const c = { all: 0, [NEARBY]: 0 };
    STATUS_ORDER.forEach((st) => {
      c[st] = 0;
    });

    for (const l of scoped) {
      const near =
        hasGps &&
        distanceMeters(coords.lat, coords.lng, l.lat, l.lng) <= nearbyRadius;
      if (near) c[NEARBY]++;
      // Кнопка «рядом» уже сузила список, значит и счётчики статусов должны
      // считать только то, что осталось видимым.
      if (nearbyFilter && hasGps && !near) continue;
      c.all++;
      const st = l.status ?? STATUS.OPEN;
      if (c[st] !== undefined) c[st]++;
    }
    return c;
  }, [scoped, hasGps, coords, nearbyRadius, nearbyFilter]);

  return {
    search: searchInput,
    setSearch: setSearchInput,
    statusFilter,
    setFilter,
    priorityFilter,
    setPriorityFilter,
    mainLocationFilter,
    setMainLocationFilter,
    mainLocationKey,
    mainLocationOptions,
    locationFilter,
    setLocationFilter,
    locationKey,
    locationOptions,
    lastLocationFilter,
    setLastLocationFilter,
    lastLocationKey: configuredLastLocationKey,
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
