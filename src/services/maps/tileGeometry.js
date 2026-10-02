// Web Mercator обрезан по широте ±85.05°: дальше к полюсам тайлов не бывает.
const MAX_MERCATOR_LAT = 85.05112878;

export function clampLatitude(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, number));
}

export function normalizeLongitude(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return ((((number + 180) % 360) + 360) % 360) - 180;
}

export function tileY(latitude, tileCount) {
  const latRad = (latitude * Math.PI) / 180;
  const value = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      tileCount,
  );
  return Math.max(0, Math.min(tileCount - 1, value));
}
