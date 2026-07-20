/** Расстояние между двумя точками в метрах (Haversine) */
function isCoordinate(value) {
  return value != null && value !== "" && Number.isFinite(Number(value));
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(isCoordinate)) {
    return Infinity;
  }
  const φ1 = Number(lat1);
  const λ1 = Number(lng1);
  const φ2 = Number(lat2);
  const λ2 = Number(lng2);
  if ([φ1, λ1, φ2, λ2].some((v) => !Number.isFinite(v))) return Infinity;
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(φ2 - φ1);
  const dLng = toRad(λ2 - λ1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(φ1)) * Math.cos(toRad(φ2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Алиас для обратной совместимости */
export const getDistanceMeters = distanceMeters;

/**
 * Ищет ближайшую утечку ближе threshold метров.
 * @returns {Object|null} найденная утечка или null
 */
export function findNearbyLeak(leaks, lat, lng, thresholdMeters = 50) {
  if (!isCoordinate(lat) || !isCoordinate(lng)) {
    return null;
  }

  let closest = null;
  let closestDist = Infinity;

  for (const leak of leaks) {
    if (!isCoordinate(leak.lat) || !isCoordinate(leak.lng)) {
      continue;
    }
    const d = distanceMeters(lat, lng, leak.lat, leak.lng);
    if (d < thresholdMeters && d < closestDist) {
      closestDist = d;
      closest = leak;
    }
  }

  return closest ? { leak: closest, distance: Math.round(closestDist) } : null;
}

/**
 * Фильтрует утечки в радиусе radiusM метров от точки.
 * Возвращает отсортированный список: ближайшие первые.
 */
export function filterNearbyLeaks(leaks, lat, lng, radiusM = 500) {
  if (!isCoordinate(lat) || !isCoordinate(lng)) return [];
  const results = [];
  for (const l of leaks) {
    if (!isCoordinate(l.lat) || !isCoordinate(l.lng)) {
      continue;
    }
    const d = distanceMeters(lat, lng, Number(l.lat), Number(l.lng));
    if (d <= radiusM) results.push({ ...l, _nearbyDist: Math.round(d) });
  }
  return results.sort((a, b) => a._nearbyDist - b._nearbyDist);
}
