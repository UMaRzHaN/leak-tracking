/**
 * Converts WGS-84 lat/lng to OpenStreetMap tile coordinates.
 * Returns { x, y, z } for use in tile URL.
 */
export function latLngToTile(lat, lng, zoom = 15) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y, z: zoom };
}

/**
 * Returns the OSM tile URL for given tile coordinates.
 * Uses a round-robin across a/b/c subdomains to reduce rate-limiting.
 */
export function tileUrl(x, y, z) {
  const sub = ["a", "b", "c"][(x + y) % 3];
  return `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

/**
 * Given a lat/lng, returns the tile URL and the pixel offset of the point
 * within the 256×256 tile, so we can position the pin accurately.
 * offset.x / offset.y are 0–255.
 */
export function tileForLatLng(lat, lng, zoom = 15) {
  const n = Math.pow(2, zoom);
  const xFrac = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yFrac =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  const tileX = Math.floor(xFrac);
  const tileY = Math.floor(yFrac);

  return {
    url: tileUrl(tileX, tileY, zoom),
    offsetX: Math.round((xFrac - tileX) * 256),
    offsetY: Math.round((yFrac - tileY) * 256),
  };
}
