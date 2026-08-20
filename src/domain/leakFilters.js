/**
 * Filter values shared by the database, the map, the monitoring list and the
 * component registry — and by the app-level state that remembers the selection
 * while the user moves between them.
 *
 * They live here rather than beside the screen that reads them most because a
 * page module is a page-sized module: `useSharedFilters` and `projectFilters`
 * load at boot, and importing one constant from `useDataBaseFilters` or
 * `monitoringDomain` pulled both of those into the boot chunk — 18 kB of
 * filtering and round arithmetic that the first screen never runs.
 */

/** The database's "near me" status filter. */
export const NEARBY = "nearby";

/** Radius the "near me" filter uses, in metres. */
export const NEARBY_RADIUS_M = 500;

export const MONITORING_FILTER = {
  DUE: "due",
  CHECKED: "checked",
  ALL: "all",
};
