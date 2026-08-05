import { normalizeLocationValue } from "@/utils/locationFilter";

// The three location fields of a project type form a natural hierarchy
// (subdivision → deposit → location for upstream, and the equivalents for the
// other types). This turns a flat leak list into that tree so the UI can be
// navigated like folders instead of driven by filter checkboxes.
//
// The tree is derived from the data every time rather than stored: a location
// only exists as long as some leak names it, so there is no separate structure
// that could fall out of sync with the records.

export function getLocationLevelKeys(locationConfig) {
  return [
    locationConfig?.main,
    locationConfig?.secondary,
    locationConfig?.last,
  ].filter((key) => typeof key === "string" && key.length > 0);
}

/**
 * @returns {Array<{value: string, count: number, children: Array}>} sorted by
 * value, with the unnamed group ("") last so it never heads the list.
 */
export function buildLocationTree(leaks, levelKeys) {
  if (!Array.isArray(leaks) || !Array.isArray(levelKeys)) return [];
  return buildLevel(leaks, levelKeys, 0);
}

function buildLevel(leaks, levelKeys, depth) {
  if (depth >= levelKeys.length) return [];
  const key = levelKeys[depth];
  const groups = new Map();
  for (const leak of leaks) {
    const value = normalizeLocationValue(leak?.[key]);
    const group = groups.get(value);
    if (group) group.push(leak);
    else groups.set(value, [leak]);
  }
  return [...groups.entries()]
    .map(([value, groupLeaks]) => ({
      value,
      count: groupLeaks.length,
      children: buildLevel(groupLeaks, levelKeys, depth + 1),
    }))
    .sort(compareNodes);
}

function compareNodes(a, b) {
  // The unnamed group is a real destination — a leak with no station still has
  // to be reachable — but it is not a place, so it sorts last.
  if (a.value === "") return b.value === "" ? 0 : 1;
  if (b.value === "") return -1;
  return a.value.localeCompare(b.value);
}

export function findChildren(tree, path) {
  let nodes = tree;
  for (const value of path) {
    const node = nodes.find((candidate) => candidate.value === value);
    if (!node) return [];
    nodes = node.children;
  }
  return nodes;
}

export function countLeaksAtPath(tree, path) {
  let nodes = tree;
  let count = null;
  for (const value of path) {
    const node = nodes.find((candidate) => candidate.value === value);
    if (!node) return 0;
    count = node.count;
    nodes = node.children;
  }
  return count ?? nodes.reduce((total, node) => total + node.count, 0);
}

/**
 * A path selects exactly one value per level, which is the shape the existing
 * `{ key, values }` filters already take. Writing into them rather than adding
 * a parallel notion of "current folder" keeps the browser and the filter
 * checkboxes two views of one state.
 */
export function pathToLocationFilters(path, levelKeys) {
  return levelKeys.map((key, depth) =>
    depth < path.length ? { key, values: [path[depth]] } : null,
  );
}

/**
 * The inverse, used by the breadcrumb. A filter carrying several values did not
 * come from the browser, so there is no single path to show: the caller is told
 * `null` and can say "several selected" instead of inventing a location.
 */
export function locationFiltersToPath(filters, levelKeys) {
  const path = [];
  for (const [depth, key] of levelKeys.entries()) {
    const filter = filters?.[depth];
    if (!filter) break;
    if (filter.key !== key || !Array.isArray(filter.values)) return null;
    if (filter.values.length !== 1) return null;
    path.push(normalizeLocationValue(filter.values[0]));
  }
  // A gap would mean a deeper level is filtered while its parent is not, which
  // no path can express.
  for (let depth = path.length; depth < levelKeys.length; depth += 1) {
    if (filters?.[depth]) return null;
  }
  return path;
}
