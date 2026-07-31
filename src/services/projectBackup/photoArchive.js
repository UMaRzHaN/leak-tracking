import { getPhotoSrc } from "@/hooks/photoService";
import { fingerprintBlob } from "@/utils/blobHash";
import { blobToDataUri, dataUrlToBlob } from "@/utils/photoConversion";
import {
  allocateUniqueLeakArchiveSegments,
  buildLeakPhotoArchivePath,
  buildMonitoringPhotoArchivePath,
  getImageMimeTypeFromExtension,
  normalizeImageExtension,
  parseDataImageUri,
} from "@/services/archivePaths";
import {
  EXPORT_CONCURRENCY,
  EXPORT_YIELD_EVERY,
  IMPORT_CONCURRENCY,
  MONITORING_PHOTO_KEY,
  PHOTO_KEYS,
} from "./constants";
import { mapWithConcurrency, yieldToMainThread } from "./runtime";

async function resolveBase64(path, idbGet) {
  if (typeof path !== "string" || !path) return null;

  let src = null;
  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    const raw = idbGet ? await idbGet(id) : null;
    // raw can be a Blob (new storage) or a data URI string (legacy storage)
    if (!raw) return null;
    src = raw instanceof Blob ? await blobToDataUri(raw) : raw;
  } else if (path.startsWith("data:image/")) {
    src = path;
  } else {
    src = await getPhotoSrc(path);
  }

  if (!src || !src.startsWith("data:")) return null;
  return parseDataImageUri(src);
}

async function resolvePhotoBlob(path, idbGet) {
  if (typeof path !== "string" || !path) return null;

  let value = null;
  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    value = idbGet ? await idbGet(id) : null;
  } else if (path.startsWith("data:image/")) {
    value = path;
  } else {
    value = await getPhotoSrc(path);
  }
  if (!value) return null;

  const blob = value instanceof Blob ? value : dataUrlToBlob(value);
  if (!blob) return null;
  const mime = blob.type || String(value).match(/^data:([^;]+);base64,/)?.[1];
  if (!mime?.startsWith("image/")) return null;
  return { blob, ext: normalizeImageExtension(mime) };
}

export async function exportLeaksWithPhotosToStream(
  leaks,
  zip,
  idbGet,
  {
    segmentPrefix = "leak",
    preserveUnresolvedPhotoPaths = false,
    leakSegments: providedLeakSegments = null,
  } = {},
) {
  const exported = new Array(leaks.length);
  const leakSegments =
    providedLeakSegments ??
    allocateUniqueLeakArchiveSegments(leaks, { prefix: segmentPrefix });

  for (const [index, leak] of leaks.entries()) {
    if (index > 0 && index % EXPORT_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }
    if (!leak || typeof leak !== "object" || Array.isArray(leak)) {
      exported[index] = leak;
      continue;
    }
    const copy = { ...leak };
    const leakNumber = leakSegments[index];

    for (const key of PHOTO_KEYS) {
      const path = leak[key];
      if (path == null) continue;
      const resolved = await resolvePhotoBlob(path, idbGet);
      if (!resolved) {
        if (!preserveUnresolvedPhotoPaths) delete copy[key];
        continue;
      }

      const archivePath = buildLeakPhotoArchivePath(
        leakNumber,
        key,
        resolved.ext,
      );
      await zip.add(archivePath, resolved.blob);
      copy[key] = `zip:${archivePath}`;
    }

    if (Array.isArray(copy.monitoringRecords)) {
      const records = [];
      for (const [recordIndex, record] of copy.monitoringRecords.entries()) {
        const path = record?.[MONITORING_PHOTO_KEY];
        if (path == null) {
          records.push(record);
          continue;
        }
        const resolved = await resolvePhotoBlob(path, idbGet);
        if (!resolved) {
          if (preserveUnresolvedPhotoPaths) {
            records.push(record);
            continue;
          }
          const sanitizedRecord = { ...record };
          delete sanitizedRecord[MONITORING_PHOTO_KEY];
          records.push(sanitizedRecord);
          continue;
        }
        const archivePath = buildMonitoringPhotoArchivePath(
          leakNumber,
          recordIndex,
          resolved.ext,
        );
        await zip.add(archivePath, resolved.blob);
        records.push({
          ...record,
          [MONITORING_PHOTO_KEY]: `zip:${archivePath}`,
        });
      }
      copy.monitoringRecords = records;
    }
    exported[index] = copy;
  }

  return exported;
}
export async function exportLeaksWithPhotos(
  leaks,
  zip,
  idbGet,
  {
    segmentPrefix = "leak",
    preserveUnresolvedPhotoPaths = false,
    leakSegments: providedLeakSegments = null,
  } = {},
) {
  const exported = new Array(leaks.length);
  const leakSegments =
    providedLeakSegments ??
    allocateUniqueLeakArchiveSegments(leaks, { prefix: segmentPrefix });
  let cursor = 0;

  async function exportOne(leak, index) {
    if (!leak || typeof leak !== "object" || Array.isArray(leak)) {
      exported[index] = leak;
      return;
    }
    const copy = { ...leak };
    const leakNumber = leakSegments[index];

    for (const key of PHOTO_KEYS) {
      const path = leak[key];
      if (path == null) continue;
      const resolved = await resolveBase64(path, idbGet);
      if (!resolved) {
        if (!preserveUnresolvedPhotoPaths) delete copy[key];
        continue;
      }

      const archivePath = buildLeakPhotoArchivePath(
        leakNumber,
        key,
        resolved.ext,
      );
      zip.file(archivePath, resolved.base64, { base64: true });
      copy[key] = `zip:${archivePath}`;
    }

    if (Array.isArray(copy.monitoringRecords)) {
      const records = [];
      for (const [recordIndex, record] of copy.monitoringRecords.entries()) {
        const path = record?.[MONITORING_PHOTO_KEY];
        if (path == null) {
          records.push(record);
          continue;
        }

        const resolved = await resolveBase64(path, idbGet);
        if (!resolved) {
          if (preserveUnresolvedPhotoPaths) {
            records.push(record);
            continue;
          }
          const sanitizedRecord = { ...record };
          delete sanitizedRecord[MONITORING_PHOTO_KEY];
          records.push(sanitizedRecord);
          continue;
        }

        const archivePath = buildMonitoringPhotoArchivePath(
          leakNumber,
          recordIndex,
          resolved.ext,
        );
        zip.file(archivePath, resolved.base64, { base64: true });
        records.push({
          ...record,
          [MONITORING_PHOTO_KEY]: `zip:${archivePath}`,
        });
      }
      copy.monitoringRecords = records;
    }

    exported[index] = copy;
  }

  async function worker() {
    while (cursor < leaks.length) {
      const index = cursor;
      cursor += 1;
      if (index > 0 && index % EXPORT_YIELD_EVERY === 0) {
        await yieldToMainThread();
      }
      await exportOne(leaks[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(EXPORT_CONCURRENCY, leaks.length) }, worker),
  );

  return exported;
}

export async function restorePhotosFromZip(
  leaks,
  zip,
  savePhotoRefOrFn,
  { keyPrefix = "" } = {},
) {
  const savePhoto =
    typeof savePhotoRefOrFn === "function"
      ? savePhotoRefOrFn
      : savePhotoRefOrFn?.current;

  const archivePhotoSizes = [];
  const collectSize = (path) => {
    if (typeof path !== "string" || !path.startsWith("zip:")) return;
    const entry = zip.file(path.slice("zip:".length));
    const size = Number(entry?._data?.uncompressedSize);
    if (Number.isFinite(size) && size > 0) archivePhotoSizes.push(size);
  };
  for (const leak of leaks) {
    for (const key of PHOTO_KEYS) collectSize(leak?.[key]);
    for (const record of leak?.monitoringRecords ?? []) {
      collectSize(record?.[MONITORING_PHOTO_KEY]);
    }
  }
  const totalPhotoBytes = archivePhotoSizes.reduce(
    (total, size) => total + size,
    0,
  );
  const largestPhotoBytes = Math.max(0, ...archivePhotoSizes);
  const concurrency =
    largestPhotoBytes > 8 * 1024 * 1024 || totalPhotoBytes > 32 * 1024 * 1024
      ? 1
      : totalPhotoBytes > 12 * 1024 * 1024
        ? 2
        : IMPORT_CONCURRENCY;

  const preparePhoto = async (path) => {
    if (path.startsWith("zip:")) {
      const relativePath = path.slice("zip:".length);
      const photoFile = zip.file(relativePath);
      if (!photoFile) return null;
      const sourceBlob = await photoFile.async("blob");
      const extension = relativePath.split(".").pop() || "jpg";
      const mime = getImageMimeTypeFromExtension(extension);
      const blob =
        sourceBlob.type === mime
          ? sourceBlob
          : new Blob([sourceBlob], { type: mime });
      return {
        blob,
        fallbackPath: null,
        contentHash: await fingerprintBlob(blob),
      };
    }
    if (path.startsWith("data:image/")) {
      const blob = dataUrlToBlob(path);
      if (!blob) return null;
      return {
        blob,
        fallbackPath: path,
        contentHash: await fingerprintBlob(blob),
      };
    }
    return null;
  };

  return mapWithConcurrency(leaks, concurrency, async (leak, leakIndex) => {
    if (!leak || typeof leak !== "object" || Array.isArray(leak)) return leak;
    const copy = { ...leak };
    const baseKey = `${keyPrefix}${String(
      leak.leak_id ?? leak.id ?? leakIndex + 1,
    )}`;
    const savedPaths = {};

    for (const key of PHOTO_KEYS) {
      const path = leak[key];
      if (typeof path !== "string" || !path) continue;

      const prepared = await preparePhoto(path);
      if (!prepared) continue;

      const storageKey =
        key === "photo_after"
          ? `${baseKey}_after`
          : key === "photo_repair"
            ? `${baseKey}_repair`
            : baseKey;
      const excludePaths = Object.values(savedPaths);
      const newPath = await savePhoto(prepared.blob, storageKey, excludePaths, {
        cleanupOldVersions: false,
        contentHash: prepared.contentHash,
      });
      if (!newPath && path.startsWith("zip:")) {
        throw new Error(`Не удалось сохранить фотографию ${path}`);
      }
      copy[key] = newPath ?? prepared.fallbackPath;
      if (newPath) savedPaths[key] = newPath;
    }

    if (Array.isArray(copy.monitoringRecords)) {
      const restoredRecords = [];
      for (const [index, record] of copy.monitoringRecords.entries()) {
        const path = record?.[MONITORING_PHOTO_KEY];
        if (typeof path !== "string" || !path) {
          restoredRecords.push(record);
          continue;
        }

        const prepared = await preparePhoto(path);
        if (!prepared) {
          restoredRecords.push(record);
          continue;
        }

        const recordId = String(record.id ?? index + 1);
        const storageKey = `${baseKey}_monitoring_${recordId}`;
        const newPath = await savePhoto(
          prepared.blob,
          storageKey,
          [...Object.values(savedPaths)],
          {
            cleanupOldVersions: false,
            contentHash: prepared.contentHash,
          },
        );
        if (!newPath && path.startsWith("zip:")) {
          throw new Error(`Не удалось сохранить фотографию ${path}`);
        }
        restoredRecords.push({
          ...record,
          [MONITORING_PHOTO_KEY]: newPath ?? prepared.fallbackPath,
        });
      }
      copy.monitoringRecords = restoredRecords;
    }

    return copy;
  });
}
