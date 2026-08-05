import { STORAGE_KEYS } from "./storageKeys";
import { normalizeLocationValue } from "@/utils/locationFilter";

const DEFAULT_NEARBY_RADIUS = 500;
const DEFAULT_MONITORING_FILTER = "due";
const MONITORING_FILTERS = new Set(["due", "checked", "all"]);

const DEFAULT_PROJECT_FILTERS = Object.freeze({
  search: "",
  statusFilter: [],
  priorityFilter: [],
  mainLocationFilter: null,
  locationFilter: null,
  lastLocationFilter: null,
  nearbyFilter: false,
  nearbyRadius: DEFAULT_NEARBY_RADIUS,
  monitoringFilter: DEFAULT_MONITORING_FILTER,
});

function normalizeValues(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string" && value
      ? [value]
      : [];
  return [...new Set(values.filter((item) => typeof item === "string"))];
}

function normalizeLocationFilter(value) {
  if (!value || typeof value.key !== "string" || !Array.isArray(value.values)) {
    return null;
  }
  return {
    key: value.key,
    values: [
      ...new Set(normalizeValues(value.values).map(normalizeLocationValue)),
    ],
  };
}

export function normalizeProjectFilters(value) {
  const radius = Number(value?.nearbyRadius);
  return {
    search: typeof value?.search === "string" ? value.search : "",
    statusFilter: normalizeValues(value?.statusFilter),
    priorityFilter: normalizeValues(value?.priorityFilter),
    mainLocationFilter: normalizeLocationFilter(value?.mainLocationFilter),
    locationFilter: normalizeLocationFilter(value?.locationFilter),
    // Third location level. Absent from filters written before it existed,
    // which normalizes to null — the same as "not filtered".
    lastLocationFilter: normalizeLocationFilter(value?.lastLocationFilter),
    nearbyFilter: value?.nearbyFilter === true,
    nearbyRadius:
      Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_NEARBY_RADIUS,
    monitoringFilter: MONITORING_FILTERS.has(value?.monitoringFilter)
      ? value.monitoringFilter
      : DEFAULT_MONITORING_FILTER,
  };
}

export function readProjectFilters(projectId) {
  if (!projectId || typeof localStorage === "undefined") {
    return { ...DEFAULT_PROJECT_FILTERS };
  }
  try {
    const value = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.PROJECT_FILTERS(projectId)) ?? "null",
    );
    return normalizeProjectFilters(value);
  } catch {
    return { ...DEFAULT_PROJECT_FILTERS };
  }
}

export function writeProjectFilters(projectId, value) {
  if (!projectId || typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(
      STORAGE_KEYS.PROJECT_FILTERS(projectId),
      JSON.stringify(normalizeProjectFilters(value)),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearProjectFilters(projectId) {
  if (!projectId || typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.PROJECT_FILTERS(projectId));
}
