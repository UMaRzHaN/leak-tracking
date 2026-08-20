import { dataUrlToBlob } from "@/utils/photoConversion";

/**
 * Turning what the photo input holds into what a stored card carries.
 *
 * These are two different things, and conflating them is what broke: the input
 * works with an object — a blob and a preview URL — while a record stores a
 * path string like "idb://…". Writing the object straight onto the card left
 * the photo unsaved and every reader calling `path.startsWith` on an object.
 *
 * The leak form has always done this conversion; the registry now does it the
 * same way, through the same photo storage.
 */

/** True for a value that is already a stored path rather than a fresh pick. */
export function isStoredPhotoPath(value) {
  return typeof value === "string" && value.length > 0;
}

/** The blob to persist, or null when nothing new was picked. */
export function extractPhotoBlob(value) {
  if (!value || isStoredPhotoPath(value)) return null;
  if (value.raw) return value.raw;
  return value.src ? dataUrlToBlob(value.src) : null;
}

/**
 * Replaces the card's photo with a stored path.
 *
 * An edit that did not touch the photo keeps the path it already had, so
 * reopening a card and saving it does not rewrite the same image under a new
 * key and orphan the old one.
 *
 * @param {Record<string, any>} card
 * @param {string} id the record the photo belongs to
 * @param {(blob: Blob, id: string, exclude: string[], options: object) => Promise<any>} savePhoto
 */
export async function withStoredPhoto(card, id, savePhoto) {
  const value = card?.photo;

  if (isStoredPhotoPath(value)) return card;

  const blob = extractPhotoBlob(value);
  if (!blob) {
    // Nothing picked and nothing stored: leave the key off entirely rather
    // than writing an empty object a reader would have to guard against.
    const { photo, ...rest } = card ?? {};
    void photo;
    return rest;
  }

  // Photo storage answers with a path, or with a {path, created} pair when
  // asked for metadata. Reading only the string would drop the photo on any
  // caller configured the other way.
  const stored = await savePhoto(blob, String(id), [], {
    cleanupOldVersions: false,
  });
  const path = typeof stored === "string" ? stored : stored?.path;
  if (!path) {
    const error = new Error("Photo storage refused the write");
    error.code = "COMPONENT_PHOTO_SAVE_FAILED";
    throw error;
  }

  return { ...card, photo: path };
}
