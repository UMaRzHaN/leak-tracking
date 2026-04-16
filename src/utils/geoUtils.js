/** Расстояние между двумя точками в метрах (Haversine) */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Ищет ближайшую утечку ближе threshold метров.
 * @returns {Object|null} найденная утечка или null
 */
export function findNearbyLeak(leaks, lat, lng, thresholdMeters = 50) {
  if (!lat || !lng) return null;

  let closest = null;
  let closestDist = Infinity;

  for (const leak of leaks) {
    if (!leak.lat || !leak.lng) continue;
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
  if (!lat || !lng) return [];
  const results = [];
  for (const l of leaks) {
    if (!l.lat || !l.lng) continue;
    const d = distanceMeters(lat, lng, Number(l.lat), Number(l.lng));
    if (d <= radiusM) results.push({ ...l, _nearbyDist: Math.round(d) });
  }
  return results.sort((a, b) => a._nearbyDist - b._nearbyDist);
}

/** Форматирует точность GPS для отображения */
export function formatAccuracy(accuracyMeters) {
  if (!accuracyMeters) return null;
  if (accuracyMeters < 5)  return { text: `±${Math.round(accuracyMeters)} м`, level: "good" };
  if (accuracyMeters < 20) return { text: `±${Math.round(accuracyMeters)} м`, level: "ok" };
  return { text: `±${Math.round(accuracyMeters)} м`, level: "poor" };
}
