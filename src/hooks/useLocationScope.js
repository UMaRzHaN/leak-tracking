import { useCallback, useMemo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { matchesLeakLocationFilter } from "@/utils/locationFilter";
import {
  buildLocationTree,
  countLeaksAtPath,
  findChildren,
  getLocationLevelKeys,
  locationFiltersToPath,
  locationFiltersToSelection,
  pathToLocationFilters,
  selectionToLocationFilters,
} from "@/utils/locationTree";

// The browsing state is not stored anywhere: it is the three location filters
// read back as a path. That way the folder view and the filter checkboxes in
// the database cannot disagree, and the selection survives a reload and a
// project switch for free, because those filters are already persisted.

export function useLocationScope({
  leaks = /** @type {any[]} */ ([]),
  sharedFilters = /** @type {any} */ (null),
  projectType = /** @type {string|null} */ (null),
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

  // `null` means the current filters are not a single path — several folders
  // are picked at once. The breadcrumb reads `selection` for those instead of
  // showing one of them and lying about the rest.
  const path = useMemo(
    () => locationFiltersToPath(filters, levelKeys),
    [filters, levelKeys],
  );

  // Several sibling folders picked in the browser. A single path reads back
  // as a selection of one, so this is non-null whenever `path` is.
  const selection = useMemo(
    () => locationFiltersToSelection(filters, levelKeys),
    [filters, levelKeys],
  );

  const levelLabels = useMemo(
    () => levelKeys.map((key) => t(`database.locationLabels.${key}`)),
    [levelKeys, t],
  );

  const writeFilters = useCallback(
    ([main, secondary, last]) => {
      sharedFilters?.setMainLocationFilter?.(main);
      sharedFilters?.setLocationFilter?.(secondary);
      sharedFilters?.setLastLocationFilter?.(last);
    },
    [sharedFilters],
  );

  const setPath = useCallback(
    (nextPath) => writeFilters(pathToLocationFilters(nextPath, levelKeys)),
    [levelKeys, writeFilters],
  );

  const setSelection = useCallback(
    (parentPath, values) =>
      writeFilters(selectionToLocationFilters(parentPath, values, levelKeys)),
    [levelKeys, writeFilters],
  );

  const scopedCount = useMemo(() => {
    if (path) return countLeaksAtPath(tree, path);
    if (!selection) return null;
    return selection.values.reduce(
      (total, value) =>
        total + countLeaksAtPath(tree, [...selection.path, value]),
      0,
    );
  }, [path, selection, tree]);

  // Filtered off the three filters rather than the path, so a selection that
  // is not a single path — several values ticked in a version that still had
  // location checkboxes — narrows the same way it does on the database screen.
  //
  // This is a view of the leaks, never the list to write back: persisting it
  // would drop every record outside the folder.
  const scopedLeaks = useMemo(() => {
    const active = filters.filter(
      (filter, depth) => filter?.key === levelKeys[depth],
    );
    if (active.length === 0) return leaks;
    return leaks.filter((leak) =>
      active.every((filter) => matchesLeakLocationFilter(leak, filter)),
    );
  }, [filters, leaks, levelKeys]);

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
    selection,
    setSelection,
    scopedCount,
    scopedLeaks,
    childrenAtPath,
    totalCount: leaks.length,
  };
}
