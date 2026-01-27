export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return Infinity;
  }

  const φ1 = Number(lat1);
  const λ1 = Number(lon1);
  const φ2 = Number(lat2);
  const λ2 = Number(lon2);

  if (
    Number.isNaN(φ1) ||
    Number.isNaN(λ1) ||
    Number.isNaN(φ2) ||
    Number.isNaN(λ2)
  ) {
    return Infinity;
  }

  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;

  const dLat = toRad(φ2 - φ1);
  const dLon = toRad(λ2 - λ1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(φ1)) * Math.cos(toRad(φ2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
