import { getPhotoBlob, getPhotoSrc } from "@/hooks/photoService";
import { blobToDataUri, dataUrlToBlob } from "@/utils/photoConversion";
import {
  allocateUniqueLeakArchiveSegments,
  normalizeImageExtension,
  parseDataImageUri,
} from "@/services/archive/archivePaths";
import { EXPORT_CONCURRENCY, EXPORT_YIELD_EVERY } from "./constants";
import { yieldToMainThread } from "./runtime";
import { planRoundMonitoringFolders } from "@/services/archive/archiveLayout";
import { exportLeakPhotos } from "./leakPhotoExport";

async function resolveBase64(path, idbGet) {
  if (typeof path !== "string" || !path) return null;

  let src = /** @type {string|null} */ (null);
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

export async function resolvePhotoBlob(path, idbGet) {
  if (typeof path !== "string" || !path) return null;

  let value = /** @type {Blob|string|null} */ (null);
  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    value = idbGet ? await idbGet(id) : null;
  } else if (path.startsWith("data:image/")) {
    value = path;
  } else {
    // Здесь нужны байты, а не строка для <img>: на устройстве это читается
    // напрямую, минуя base64 и мост. Каждое фото проекта проходит через эту
    // строку, когда собирается архив — и для выгрузки, и для переноса по QR.
    value = (await getPhotoBlob(path)) ?? (await getPhotoSrc(path));
  }
  if (!value) return null;

  const blob = value instanceof Blob ? value : dataUrlToBlob(value);
  if (!blob) return null;
  const mime = blob.type || String(value).match(/^data:([^;]+);base64,/)?.[1];
  if (!mime?.startsWith("image/")) return null;
  return { blob, ext: normalizeImageExtension(mime) };
}

/** Папки утечек и раскладка по обходам — общие для обеих выгрузок. */
function planExport(leaks, options) {
  const {
    segmentPrefix = "leak",
    preserveUnresolvedPhotoPaths = false,
    leakSegments = null,
    monitoringFolderLabel = null,
  } = options;
  return {
    leakSegments:
      leakSegments ??
      allocateUniqueLeakArchiveSegments(leaks, { prefix: segmentPrefix }),
    placeRecord: monitoringFolderLabel
      ? planRoundMonitoringFolders(leaks, monitoringFolderLabel).byRecord
      : null,
    preserveUnresolvedPhotoPaths,
  };
}

const isLeakRecord = (leak) =>
  Boolean(leak) && typeof leak === "object" && !Array.isArray(leak);

/**
 * @typedef {{
 *   segmentPrefix?: string,
 *   preserveUnresolvedPhotoPaths?: boolean,
 *   leakSegments?: string[]|null,
 *   monitoringFolderLabel?: ((result: string) => string)|null,
 * }} ExportOptions
 */

/** Потоковая выгрузка: снимки уходят в архив байтами, по одной утечке. */
export async function exportLeaksWithPhotosToStream(
  leaks,
  zip,
  idbGet,
  options = /** @type {ExportOptions} */ ({}),
) {
  const plan = planExport(leaks, options);
  const store = async (path) => {
    const resolved = await resolvePhotoBlob(path, idbGet);
    if (!resolved) return null;
    return {
      ext: resolved.ext,
      write: (archivePath) => zip.add(archivePath, resolved.blob),
    };
  };

  const exported = new Array(leaks.length);
  for (const [index, leak] of leaks.entries()) {
    if (index > 0 && index % EXPORT_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }
    exported[index] = isLeakRecord(leak)
      ? await exportLeakPhotos(leak, plan.leakSegments[index], store, plan)
      : leak;
  }
  return exported;
}

/** Выгрузка через JSZip: снимки — base64, утечки — в несколько потоков. */
export async function exportLeaksWithPhotos(
  leaks,
  zip,
  idbGet,
  options = /** @type {ExportOptions} */ ({}),
) {
  const plan = planExport(leaks, options);
  const store = async (path) => {
    const resolved = await resolveBase64(path, idbGet);
    if (!resolved) return null;
    return {
      ext: resolved.ext,
      write: (archivePath) =>
        zip.file(archivePath, resolved.base64, { base64: true }),
    };
  };

  const exported = new Array(leaks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < leaks.length) {
      const index = cursor;
      cursor += 1;
      if (index > 0 && index % EXPORT_YIELD_EVERY === 0) {
        await yieldToMainThread();
      }
      const leak = leaks[index];
      exported[index] = isLeakRecord(leak)
        ? await exportLeakPhotos(leak, plan.leakSegments[index], store, plan)
        : leak;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(EXPORT_CONCURRENCY, leaks.length) }, worker),
  );
  return exported;
}
