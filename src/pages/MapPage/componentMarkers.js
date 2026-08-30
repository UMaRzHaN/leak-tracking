import { getDistanceMeters } from "@/utils/geoUtils";
import { matchesLeakLocationFilter } from "@/utils/locationFilter";
import { toNullableNumber } from "@/utils/normalize/toNullableNumber";

/**
 * Component cards as things the map can draw.
 *
 * The two bases are kept apart on screen rather than merged into one layer:
 * a leak is an event and a component is an Record<string, any>, they are counted by
 * different people for different reports, and a single pin sheet mixing them
 * would make "how many are there" unanswerable for either.
 *
 * The shape is the leak marker's on purpose — the map already knows how to
 * place, cluster and pop up that shape, and the `kind` field is what tells it
 * to colour and caption the pin as equipment.
 */
export function toComponentMarkers(components = []) {
  const markers = [];

  for (const component of components) {
    const lat = toNullableNumber(component?.lat);
    const lng = toNullableNumber(component?.lng);
    // A card without a fix is not on the map. It is not lost — it is in the
    // registry, which is where the walk is read from.
    if (lat == null || lng == null) continue;

    markers.push({
      ...component,
      kind: "component",
      lat,
      lng,
      // The number the walker wrote on the equipment is what labels the pin.
      leak_id: component.component_uid ?? component.scheme_tag ?? "",
    });
  }

  return markers;
}

/**
 * The filters that mean something for equipment.
 *
 * Place and distance do; status, priority and the monitoring round do not —
 * those describe how a leak is being dealt with, and a valve is not being
 * dealt with. The map hides those buttons on this base rather than leaving
 * them there doing nothing.
 *
 * @param {Record<string, any>[]} markers
 * @param {{sharedFilters?: Record<string, any>|null, nearbyOnly?: boolean, nearbyRadius?: number, coords?: {lat: number, lng: number}|null}} options
 */
export function filterComponentMarkers(
  markers,
  {
    sharedFilters = /** @type {Record<string, any>|null} */ (null),
    nearbyOnly = false,
    nearbyRadius = 0,
    coords = /** @type {{lat: number, lng: number}|null} */ (null),
  },
) {
  const origin =
    nearbyOnly && Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng)
      ? coords
      : null;

  return markers.filter((marker) => {
    if (
      !matchesLeakLocationFilter(marker, sharedFilters?.mainLocationFilter) ||
      !matchesLeakLocationFilter(marker, sharedFilters?.locationFilter) ||
      !matchesLeakLocationFilter(marker, sharedFilters?.lastLocationFilter)
    ) {
      return false;
    }

    if (!origin) return true;
    return (
      getDistanceMeters(origin.lat, origin.lng, marker.lat, marker.lng) <=
      nearbyRadius
    );
  });
}
