export function assignTileSource(tile, source, done, { blobUrl = false } = {}) {
  if (tile?._removed) {
    if (blobUrl) URL.revokeObjectURL(source);
    return false;
  }

  if (blobUrl) tile._blobUrl = source;
  tile.onload = () => done(null, tile);
  tile.onerror = (error) => done(error, tile);
  tile.src = source;
  return true;
}

export function releaseTileResources(tile) {
  if (!tile) return;
  tile._removed = true;
  tile._abortController?.abort();
  tile._abortController = null;

  if (!tile._blobUrl) return;
  tile.onload = null;
  tile.onerror = null;
  if (typeof tile.src === "string" && tile.src.startsWith("blob:")) {
    tile.src = "";
  }
  URL.revokeObjectURL(tile._blobUrl);
  tile._blobUrl = null;
}
