import { buildMapTileUrl } from "@/configs/mapTiles";
import { cacheTile, getTileBlobUrl } from "@/services/maps/tileCache";
import { isPlaceholderTile } from "@/services/maps/tilePlaceholder";

// Снимки Esri снимались в разные годы и с разной детальностью: в одном квартале
// есть девятнадцатый уровень, в соседнем — только семнадцатый. Где тайла нет,
// берём родителя уровнем-двумя крупнее и растягиваем нужную четверть. Картинка
// мягче, зато трубы и дороги видны, а не серое поле с надписью.
export const MAX_FALLBACK_LEVELS = 6;

// Соседние тайлы спрашивают одних и тех же родителей. Отсутствующих запоминаем,
// чтобы прокрутка по пустому месту не превращалась в шквал лишних запросов.
const MISSING_LIMIT = 2_000;
const missingTiles = new Set();

function rememberMissing(url) {
  if (missingTiles.size >= MISSING_LIMIT) missingTiles.clear();
  missingTiles.add(url);
}

export function parentTile({ x, y, z }, levels) {
  const scale = 2 ** levels;
  return { x: Math.floor(x / scale), y: Math.floor(y / scale), z: z - levels };
}

async function loadTileBlobUrl(coords, { signal, network }) {
  const url = buildMapTileUrl(coords.z, coords.y, coords.x);
  const cached = await getTileBlobUrl(url);
  if (cached) return cached;
  if (!network || missingTiles.has(url)) return null;
  const response = await fetch(url, { mode: "cors", signal });
  if (!response.ok) return null;
  const responseToCache = response.clone();
  const blob = await response.blob();
  if (await isPlaceholderTile(blob)) {
    rememberMissing(url);
    return null;
  }
  cacheTile(url, responseToCache);
  return URL.createObjectURL(blob);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function cropToBlobUrl(sourceUrl, coords, levels, size) {
  const image = await loadImage(sourceUrl);
  const scale = 2 ** levels;
  const span = image.naturalWidth / scale;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(
    image,
    (coords.x % scale) * span,
    (coords.y % scale) * span,
    span,
    span,
    0,
    0,
    size,
    size,
  );
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  return blob ? URL.createObjectURL(blob) : null;
}

/**
 * Собирает тайл из ближайшего родителя, у которого есть снимок.
 * @param {{x: number, y: number, z: number}} coords
 * @param {{signal?: AbortSignal, network?: boolean, size?: number}} [options]
 * @returns {Promise<string|null>} blob-ссылка или null, если снимка нет и выше
 */
export async function overzoomTileUrl(
  coords,
  { signal, network = true, size = 256 } = {},
) {
  for (
    let levels = 1;
    levels <= MAX_FALLBACK_LEVELS && coords.z - levels >= 0;
    levels++
  ) {
    if (signal?.aborted) return null;
    let source = /** @type {string|null} */ (null);
    try {
      source = await loadTileBlobUrl(parentTile(coords, levels), {
        signal,
        network,
      });
    } catch {
      if (signal?.aborted) return null;
    }
    if (!source) continue;
    try {
      return await cropToBlobUrl(source, coords, levels, size);
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(source);
    }
  }
  return null;
}
