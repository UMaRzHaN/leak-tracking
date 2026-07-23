const EMPTY_LOCATION_LABELS = new Set(["Не указано", "Not specified"]);

function getFilterValues(filter, locationKey) {
  if (filter?.key !== locationKey || !Array.isArray(filter.values)) return null;
  return new Set(filter.values.map(String));
}

export function buildSmartLocationSelection(locations, search) {
  if (!search?.trim()) return null;

  const normalizedQuery = String(search)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replaceAll("ё", "е")
    .trim();
  const matchingLocations = locations.filter((location) =>
    String(location)
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replaceAll("ё", "е")
      .includes(normalizedQuery),
  );
  if (matchingLocations.length === 0) return null;

  const selectedLocations = new Set(matchingLocations);
  return Object.fromEntries(
    locations.map((location) => [location, selectedLocations.has(location)]),
  );
}

export function getEnabledLocations(locations, locationKey, filter) {
  const selected = getFilterValues(filter, locationKey);
  return Object.fromEntries(
    locations.map((location) => [
      location,
      selected ? selected.has(String(location)) : true,
    ]),
  );
}

export function buildLocationFilterFromEnabled(
  locations,
  locationKey,
  enabledLocations,
) {
  const values = locations.filter((location) => enabledLocations[location]);
  if (values.length === locations.length) return null;
  return { key: locationKey, values };
}

export function matchesLeakLocationFilter(leak, filter) {
  if (!filter?.key || !Array.isArray(filter.values)) return true;
  const selected = new Set(filter.values.map(String));
  const value = leak?.[filter.key];
  if (value == null || String(value).trim() === "") {
    return [...EMPTY_LOCATION_LABELS].some((label) => selected.has(label));
  }
  return selected.has(String(value));
}
