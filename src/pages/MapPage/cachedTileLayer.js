import L from "leaflet";
import { cacheTile, getTileBlobUrl } from "@/services/maps/tileCache";
import { fetchGoogleTile } from "@/services/maps/googleTiles";
import { isPlaceholderTile } from "@/services/maps/tilePlaceholder";
import {
  MAP_MAX_NATIVE_ZOOM,
  MAP_MAX_ZOOM,
  OFFLINE_MAP_ONLY,
  TILE_ATTRIBUTION,
  TILE_URL_TEMPLATE,
} from "@/configs/mapTiles";
import { attachGoogleAttribution } from "./googleAttribution";
import { overzoomTileUrl } from "./tileFallback";
import { assignTileSource, releaseTileResources } from "./tileLifecycle";

const TRANSPARENT_GIF =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

// Подставляет растянутый снимок уровнем крупнее. Возвращает false, только
// если подставить нечего и тайл всё ещё ждёт своей картинки.
async function assignOverzoomTile(tile, coords, done, network) {
  const url = await overzoomTileUrl(coords, {
    signal: tile._abortController?.signal,
    network,
  });
  if (!url) return tile._removed;
  assignTileSource(tile, url, done, { blobUrl: true });
  return true;
}

// Где у Esri дыра, сначала спрашиваем Google: его снимок того же уровня
// лучше растянутого. В кэш он не идёт — это запрещают условия Google.
async function assignGoogleTile(layer, tile, coords, done) {
  const blob = await fetchGoogleTile(coords, tile._abortController?.signal);
  if (!blob) return tile._removed;
  const url = URL.createObjectURL(blob);
  if (assignTileSource(tile, url, done, { blobUrl: true })) {
    layer.fire("googletile");
  }
  return true;
}

export const CachedTileLayer = L.TileLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement("img");
    tile.alt = "";
    tile._removed = false;
    tile._abortController = new AbortController();

    const url = this.getTileUrl(coords);

    getTileBlobUrl(url).then(async (blobUrl) => {
      if (blobUrl) {
        assignTileSource(tile, blobUrl, done, { blobUrl: true });
        return;
      }
      if (tile._removed) return;
      if (OFFLINE_MAP_ONLY) {
        if (await assignOverzoomTile(tile, coords, done, false)) return;
        assignTileSource(tile, TRANSPARENT_GIF, done);
        return;
      }

      try {
        const response = await fetch(url, {
          mode: "cors",
          signal: tile._abortController?.signal,
        });
        if (!response.ok) throw new Error("bad status");

        const responseToCache = response.clone();
        const blob = await response.blob();

        // Снимка этого уровня здесь нет — растягиваем уровень крупнее.
        if (await isPlaceholderTile(blob)) {
          if (tile._removed) return;
          if (await assignGoogleTile(this, tile, coords, done)) return;
          if (await assignOverzoomTile(tile, coords, done, true)) return;
          assignTileSource(tile, TRANSPARENT_GIF, done);
          return;
        }

        cacheTile(url, responseToCache);

        const objectUrl = URL.createObjectURL(blob);
        assignTileSource(tile, objectUrl, done, { blobUrl: true });
      } catch {
        if (tile._removed) return;
        // Без сети выручает скачанный заранее район уровнем крупнее.
        if (await assignOverzoomTile(tile, coords, done, false)) return;
        tile.crossOrigin = "anonymous";
        assignTileSource(tile, url, done);
      }
    });

    return tile;
  },

  _removeTile(key) {
    const tile = this._tiles[key];
    releaseTileResources(tile?.el);
    L.TileLayer.prototype._removeTile.call(this, key);
  },
});

export function addBaseTileLayer(map) {
  const layer = new /** @type {any} */ (CachedTileLayer)(TILE_URL_TEMPLATE, {
    maxZoom: MAP_MAX_ZOOM,
    maxNativeZoom: MAP_MAX_NATIVE_ZOOM,
    attribution: TILE_ATTRIBUTION,
  }).addTo(map);
  const detachAttribution = attachGoogleAttribution(map, layer);
  return { layer, detachAttribution };
}
