/**
 * Main-thread stand-in for an archive that lives inside the worker.
 *
 * Exposes the same shape as createArchivePhotoReader, so restorePhotos cannot
 * tell the difference — which is the whole reason parseBackupZip stopped
 * handing out its JSZip instance.
 */
export function createArchivePhotoProxyReader(sizes, readPhoto) {
  // Own-property checks throughout: the keys come from an archive, so a path
  // colliding with an Object.prototype member must not resolve to a function.
  const hasEntry = (path) =>
    Object.prototype.hasOwnProperty.call(sizes, String(path));

  return {
    has(path) {
      return hasEntry(path);
    },
    declaredSize(path) {
      return hasEntry(path) ? sizes[path] : 0;
    },
    read(path) {
      return hasEntry(path) ? readPhoto(path) : Promise.resolve(null);
    },
  };
}
