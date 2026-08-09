import { getImageMimeTypeFromExtension } from "@/services/archive/archivePaths";
import { mapWithConcurrency } from "@/services/backup/runtime";
import { readArchiveEntry } from "@/utils/importLimits";
import {
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";

// Kept free of any platform access on purpose: this module is what the import
// worker loads. Pulling in photoService here would drag the Capacitor
// Filesystem bridge into the worker bundle, where the plugin cannot work.

const PHOTO_KEYS = new Set(LEAK_PHOTO_FIELDS);

// Measured and left alone: unlike the photoPipeline constants, this one does
// not matter. Hydrating a 52.6 MB archive takes ~270 ms whatever the value —
// across five sweeps the spread within one concurrency was wider than the gap
// between concurrencies. JPEG bytes are already compressed, so JSZip stores
// them and extraction is a memory slice, not inflate. Nor does the value trade
// time for memory: photoCache below retains every blob for the whole call, so
// peak footprint is the same at 1 as at 8. See performance/README.md.
export const DEFAULT_ZIP_HYDRATE_CONCURRENCY = 3;

function getMimeFromPath(path) {
  const extension = String(path).split(".").pop() || "jpg";
  return getImageMimeTypeFromExtension(extension);
}

async function zipPhotoToBlob(zip, path) {
  const relativePath = path.replace(/^zip:/, "");
  const file = zip.file(relativePath);
  if (!file) return null;
  const blob = await readArchiveEntry(zip, file, "blob");
  const mime = getMimeFromPath(relativePath);
  return blob.type === mime ? blob : new Blob([blob], { type: mime });
}

export async function hydrateZipPhotos(
  result,
  zip,
  concurrency = DEFAULT_ZIP_HYDRATE_CONCURRENCY,
) {
  let restoredPhotos = 0;
  let missingPhotos = 0;
  let photoReferences = 0;
  const photoCache = new Map();
  const readPhoto = (path) => {
    const key = String(path).replace(/^zip:/, "");
    if (!photoCache.has(key)) {
      photoCache.set(key, zipPhotoToBlob(zip, `zip:${key}`));
    }
    return photoCache.get(key);
  };

  // Decompressing a photo out of the ZIP is the slow part here, and each one
  // is independent, so leaks are hydrated with the same bounded concurrency
  // the rest of the photo pipeline uses. mapWithConcurrency writes results by
  // index, so leak order is preserved; readPhoto memoizes its promise per
  // entry, so a shared photo is still only decompressed once.
  const leaks = await mapWithConcurrency(
    result.leaks,
    concurrency,
    async (leak) => {
      const copy = { ...leak };

      for (const key of PHOTO_KEYS) {
        if (!String(copy[key] ?? "").startsWith("zip:")) continue;
        photoReferences += 1;
        const photoBlob = await readPhoto(copy[key]);
        if (photoBlob) {
          copy[key] = photoBlob;
          restoredPhotos += 1;
        } else {
          delete copy[key];
          missingPhotos += 1;
        }
      }

      if (Array.isArray(copy.monitoringRecords)) {
        copy.monitoringRecords = [];
        for (const record of leak.monitoringRecords) {
          const recordCopy = { ...record };
          for (const field of MONITORING_PHOTO_FIELDS) {
            if (!String(record?.[field] ?? "").startsWith("zip:")) continue;
            photoReferences += 1;
            const photoBlob = await readPhoto(record[field]);
            if (!photoBlob) {
              delete recordCopy[field];
              missingPhotos += 1;
              continue;
            }
            restoredPhotos += 1;
            recordCopy[field] = photoBlob;
          }
          copy.monitoringRecords.push(recordCopy);
        }
      }

      return copy;
    },
  );

  return {
    ...result,
    leaks,
    stats: {
      ...result.stats,
      restoredPhotos,
      missingPhotos,
      uniquePhotoEntriesRead: photoCache.size,
      photoReferences,
    },
  };
}
