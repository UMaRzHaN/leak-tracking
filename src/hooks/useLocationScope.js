import { useCallback, useMemo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import {
  buildLocationTree,
  countLeaksAtPath,
  findChildren,
  getLocationLevelKeys,
  locationFiltersToPath,
  pathToLocationFilters,
} from "@/utils/locationTree";

// The browsing state is not stored anywhere: it is the three location filters
// read back as a path. That way the folder view and the filter checkboxes in
// the database cannot disagree, and the selection survives a reload and a
// project switch for free, because those filters are already persisted.

export function useLocationScope({
  leaks = [],
  sharedFilters = null,
  projectType = null,
}) {
  const { t } = useLanguage();
  const levelKeys = useMemo(
    () => getLocationLevelKeys(PROJECT_LOCATION_CONFIG[projectType]),
    [projectType],
  );

  const filters = useMemo(
    () => [
      sharedFilters?.mainLocationFilter ?? null,
      sharedFilters?.locationFilter ?? null,
      sharedFilters?.lastLocationFilter ?? null,
    ],
    [
      sharedFilters?.mainLocationFilter,
      sharedFilters?.locationFilter,
      sharedFilters?.lastLocationFilter,
    ],
  );

  const tree = useMemo(
    () => buildLocationTree(leaks, levelKeys),
    [leaks, levelKeys],
  );

  // `null` means the current filters are not a single path — the user picked
  // several values in the database checkboxes. The breadcrumb says so instead
  // of showing one of them and lying about the rest.
  const path = useMemo(
    () => locationFiltersToPath(filters, levelKeys),
    [filters, levelKeys],
  );

  const levelLabels = useMemo(
    () => levelKeys.map((key) => t(`database.locationLabels.${key}`)),
    [levelKeys, t],
  );

  const setPath = useCallback(
    (nextPath) => {
      const [main, secondary, last] = pathToLocationFilters(
        nextPath,
        levelKeys,
      );
      sharedFilters?.setMainLocationFilter?.(main);
      sharedFilters?.setLocationFilter?.(secondary);
      sharedFilters?.setLastLocationFilter?.(last);
    },
    [levelKeys, sharedFilters],
  );

  const scopedCount = useMemo(
    () => (path ? countLeaksAtPath(tree, path) : null),
    [path, tree],
  );

  const childrenAtPath = useCallback(
    (currentPath) => findChildren(tree, currentPath),
    [tree],
  );

  return {
    available: levelKeys.length > 0,
    levelKeys,
    levelLabels,
    tree,
    path,
    setPath,
    scopedCount,
    childrenAtPath,
    totalCount: leaks.length,
  };
}
