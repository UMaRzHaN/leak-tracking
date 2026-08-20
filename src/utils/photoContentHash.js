// Photos saved with a known content hash are stored under a content-addressed
// name — `photo_<leak>_h_<hash>` on web, the same plus `.jpg` on device (see
// PhotoRepository.save).
//
// The hash names the *source* blob the file was created from, not the bytes on
// disk: save() hashes what it was handed and only then compresses. That is
// exactly what an import needs to compare against, because the incoming photo
// is likewise uncompressed at that point — and it means the comparison no
// longer has to read the stored file back at all. On Android that read crosses
// the Capacitor bridge as base64, and reconciling 40 photos spent roughly eight
// seconds doing nothing else.
//
// Photos taken with the camera are versioned by timestamp instead and have no
// hash in the name; for those this returns null and the caller falls back to
// reading the blob.
const CONTENT_HASH_PATTERN = /_h_([a-f0-9]{24,64})(?:\.jpg)?$/;

/**
 * The content hash a stored photo path carries, or null when the path is not
 * content-addressed.
 *
 * @param {unknown} path
 * @returns {string|null}
 */
export function getPhotoPathContentHash(path) {
  if (typeof path !== "string") return null;
  return CONTENT_HASH_PATTERN.exec(path)?.[1] ?? null;
}
