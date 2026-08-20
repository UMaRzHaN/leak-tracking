import { readJpegDimensions } from "@/utils/jpegDimensions";

export const MAX_PHOTO_WIDTH = 1280;

// A JPEG no wider than MAX_PHOTO_WIDTH and no heavier than this is already
// inside the budget compressImage exists to enforce, so running it would spend
// a decode and a re-encode to produce the same picture — slightly worse, since
// each pass loses a little quality. Photos this app exported are always in that
// range; the limit is what keeps an unusually heavy foreign JPEG of the same
// pixel size from slipping through uncompressed.
const MAX_UNCOMPRESSED_PHOTO_BYTES = 1024 * 1024;

/**
 * Whether a photo can be stored as it is, with no compression pass.
 *
 * @param {Blob} blob
 */
export async function isWithinPhotoBudget(blob) {
  if (!(blob instanceof Blob)) return false;
  if (blob.type !== "image/jpeg") return false;
  if (blob.size > MAX_UNCOMPRESSED_PHOTO_BYTES) return false;
  const dimensions = await readJpegDimensions(blob);
  return Boolean(dimensions) && dimensions.width <= MAX_PHOTO_WIDTH;
}

export async function compressImage(
  blob,
  { maxWidth = MAX_PHOTO_WIDTH, quality = 0.75 } = {},
) {
  return new Promise((resolve) => {
    const img = new Image();
    let url;
    try {
      url = URL.createObjectURL(blob);
    } catch {
      resolve(blob);
      return;
    }

    const cleanup = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Revoking an already invalid object URL must not block the fallback.
      }
    };
    const fallback = () => {
      cleanup();
      resolve(blob);
    };

    img.onload = () => {
      cleanup();
      try {
        if (!img.naturalWidth || !img.naturalHeight) {
          resolve(blob);
          return;
        }
        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const width = Math.round(img.naturalWidth * scale);
        const height = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(blob);
          return;
        }
        context.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (output) => resolve(output ?? blob),
          "image/jpeg",
          quality,
        );
      } catch {
        resolve(blob);
      }
    };
    img.onerror = fallback;
    img.src = url;
  });
}
