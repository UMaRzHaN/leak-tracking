import { useState, useMemo, useEffect } from "react";
import { STATUS, STATUS_ORDER } from "@/utils/status";
import { distanceMeters, filterNearbyLeaks } from "@/utils/geoUtils";
import { ABBREV_MAP } from "@/features/search/Autocomplete/smartFilter";
import { matchesLeakLocationFilter } from "@/utils/locationFilter";
import { compareLeakRecency } from "@/utils/leakOrder";

export const ALL = "all";
import { NEARBY, NEARBY_RADIUS_M } from "@/domain/leakFilters";

export const NEARBY_RADIUS_OPTIONS = [100, 500, 1000];

export function normalizeMultiFilter(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== ALL);
  return value && value !== ALL ? [value] : [];
}

const SEARCH_KEYS = [
  "id",
  "leak_id",
  "video_id",
  "subdivision",
  "deposit",
  "field",
  "station",
  "district",
  "locality",
  "address",
  "location",
  "object",
  "category",
  "component",
  "leak_description",
  "leak_cause",
  "technological_solution",
  "repair_recommendation",
  "materials_equipment",
  "note",
  "detectedBy",
  "equipmentType",
  "serial_number",
];

const MONITORING_SEARCH_KEYS = [
  "monitoredBy",
  "comment",
  "materials_equipment",
  "result",
];

const HISTORY_SEARCH_KEYS = ["user", "text", "from", "to"];

export function normalizeLeakSearchText(value) {
  return String(value ?? "")
    .replace(/[№#]/g, " ")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function collectValues(source, keys) {
  if (!source || typeof source !== "object") return [];
  return keys.map((key) => source[key]).filter((value) => value != null);
}

const ACRONYM_STOP_WORDS = new Set([
  "и",
  "в",
  "во",
  "на",
  "по",
  "для",
  "с",
  "со",
  "за",
  "из",
  "к",
  "of",
  "the",
  "and",
  "for",
]);

const NORMALIZED_ABBREVIATIONS = Object.entries(ABBREV_MAP).map(
  ([abbreviation, expanded]) => [
    normalizeLeakSearchText(abbreviation),
    normalizeLeakSearchText(expanded),
  ],
);

function buildSearchAcronyms(values) {
  const normalizedValues = values
    .filter((value) => value != null && String(value).trim())
    .map(normalizeLeakSearchText);
  const combined = normalizedValues.join(" ");
  const acronyms = new Set();

  for (const value of normalizedValues) {
    const words = value
      .split(" ")
      .filter((word) => word && !ACRONYM_STOP_WORDS.has(word));
    if (words.length >= 2 && words.length <= 8) {
      acronyms.add(words.map((word) => word[0]).join(""));
    }
  }

  for (const [abbreviation, expanded] of NORMALIZED_ABBREVIATIONS) {
    if (expanded && combined.includes(expanded)) {
      acronyms.add(abbreviation);
    }
  }

  return [...acronyms].join(" ");
}

export function buildLeakSearchText(leak) {
  const tag = leak?.leak_id ?? "";
  const values = [
    ...collectValues(leak, SEARCH_KEYS),
    `бирка ${tag}`,
    `tag ${tag}`,
    `б ${tag}`,
    `b ${tag}`,
    `т ${tag}`,
    `t ${tag}`,
  ];

  for (const record of leak?.monitoringRecords ?? []) {
    values.push(...collectValues(record, MONITORING_SEARCH_KEYS));
  }
  for (const entry of leak?.history ?? []) {
    values.push(...collectValues(entry, HISTORY_SEARCH_KEYS));
    for (const change of entry?.changes ?? []) {
      values.push(change?.from, change?.to);
    }
  }

  return normalizeLeakSearchText(
    `${values.join(" ")} ${buildSearchAcronyms(values)}`,
  );
}

export function matchesLeakSearch(leak, query) {
  const normalizedQuery = normalizeLeakSearchText(query);
  if (!normalizedQuery) return true;
  const searchText = buildLeakSearchText(leak);
  return normalizedQuery
    .split(" ")
    .every((token) => searchText.includes(token));
}

export function useDataBaseFilters({
  data,
  coords,
  sharedFilters = null,
  configuredMainLocationKey = null,
  configuredLocationKey = null,
  configuredLastLocationKey = null,
}) {
  const [localSearchInput, setLocalSearchInput] = useState("");
  const [search, setSearch] = useState(() => sharedFilters?.search ?? "");
  const [localStatusFilter, setLocalStatusFilter] = useState([]);
  const [localPriorityFilter, setLocalPriorityFilter] = useState([]);
  const [localMainLocationFilter, setLocalMainLocationFilter] = useState(null);
  const [localLocationFilter, setLocalLocationFilter] = useState(null);
  const [localLastLocationFilter, setLocalLastLocationFilter] = useState(null);
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

  const displayed = useMemo(() => {
    const applySearch = (list) =>
      searchTokens.length > 0
        ? list.filter((leak) =>
            searchTokens.every((token) =>
              searchIndex.get(leak)?.includes(token),
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

    // The toggle above this list is labelled "date", and it sorted by
    // `compareLeakIds` — the record id. Imported records carry a numeric id and
    // came out roughly by age, which hid it; anything added in the app gets a
    // random UUID, so the control promised dates and delivered noise.
    let list = [...data].sort((a, b) =>
      sortAsc ? compareLeakRecency(b, a) : compareLeakRecency(a, b),
    );
    if (statusFilter.length > 0)
      list = list.filter((l) => statusFilter.includes(l.status ?? STATUS.OPEN));
    if (nearbyFilter && hasGps)
      list = filterNearbyLeaks(list, coords.lat, coords.lng, nearbyRadius);
    return applySearch(
      applyPriority(applyLastLocation(applyLocation(applyMainLocation(list)))),
    );
  }, [
    data,
    statusFilter,
    nearbyFilter,
    nearbyRadius,
    priorityFilter,
    mainLocationFilter,
    mainLocationKey,
    locationFilter,
    locationKey,
    lastLocationFilter,
    configuredLastLocationKey,
    searchIndex,
    searchTokens,
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
        const distance = distanceMeters(coords.lat, coords.lng, l.lat, l.lng);
        if (distance <= nearbyRadius) c[NEARBY]++;
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
