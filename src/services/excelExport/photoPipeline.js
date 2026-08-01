import {
  buildLeakPhotoArchivePath,
  buildMonitoringPhotoArchivePath,
  parseDataImageUri,
} from "@/services/archivePaths";
import { getPhotoSrc } from "@/hooks/photoService";
import { blobToDataUri } from "@/utils/photoConversion";
import { getMonitoringRecords } from "@/utils/monitoring";

export const PHOTO_KEYS = ["photo", "photo_after", "photo_repair"];

const EXPORT_YIELD_EVERY = 40;
const PHOTO_READ_CONCURRENCY = 4;

function yieldToMainThread() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function resolvePhotoSrc(path, idbGet) {
  if (!path) return null;

  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    const raw = idbGet ? await idbGet(id) : null;
    if (!raw) return null;
    return raw instanceof Blob ? blobToDataUri(raw) : raw;
  }

  return getPhotoSrc(path);
}

async function resolvePhotoCandidates(candidates, idbGet, photoReadCache) {
  if (candidates.length === 0) return [];

  const entries = new Array(candidates.length);
  let nextIndex = 0;
  let completed = 0;

  async function runWorker() {
    while (nextIndex < candidates.length) {
      const candidateIndex = nextIndex;
      nextIndex += 1;
      const candidate = candidates[candidateIndex];
      let sourcePromise = photoReadCache.get(candidate.path);
      if (!sourcePromise) {
        sourcePromise = resolvePhotoSrc(candidate.path, idbGet);
        photoReadCache.set(candidate.path, sourcePromise);
      }
      const src = await sourcePromise;

      if (src?.startsWith("data:")) {
        const parsed = parseDataImageUri(src);
        if (parsed) {
          entries[candidateIndex] = {
            mapKey: candidate.mapKey,
            logicalKey: candidate.logicalKey,
            sourcePath: candidate.path,
            photoFileName: candidate.buildArchivePath(parsed.ext),
            base64: parsed.base64,
          };
        }
      }

      completed += 1;
      if (completed % EXPORT_YIELD_EVERY === 0) {
        await yieldToMainThread();
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(PHOTO_READ_CONCURRENCY, candidates.length) },
      () => runWorker(),
    ),
  );
  return entries.filter(Boolean);
}

function getLeakPhotoIdentity(leak, leakIndex, photoKey) {
  const leakIdentity =
    leak?.id != null && String(leak.id).trim()
      ? `id:${String(leak.id)}`
      : `tag:${String(leak?.leak_id ?? "").trim() || `index:${leakIndex}`}`;
  return `${leakIdentity}:field:${photoKey}`;
}

function getMonitoringPhotoIdentity(leak, leakIndex, record, recordIndex) {
  const leakIdentity =
    leak?.id != null && String(leak.id).trim()
      ? `id:${String(leak.id)}`
      : `tag:${String(leak?.leak_id ?? "").trim() || `index:${leakIndex}`}`;
  const recordIdentity =
    record?.id != null && String(record.id).trim()
      ? `id:${String(record.id)}`
      : `index:${recordIndex}`;
  return `${leakIdentity}:monitoring:${recordIdentity}`;
}

export async function buildLeakPhotoEntries(
  orderedLeaks,
  leakSegments,
  idbGet,
  photoReadCache,
  archiveRoot = "photos",
) {
  const candidates = [];

  for (const [leakIndex, leak] of orderedLeaks.entries()) {
    for (const key of PHOTO_KEYS) {
      const path = leak[key];
      if (!path) continue;

      const leakSegment = leakSegments[leakIndex];
      candidates.push({
        path,
        mapKey: `${leakIndex}:${key}`,
        logicalKey: getLeakPhotoIdentity(leak, leakIndex, key),
        buildArchivePath: (extension) => {
          const backupPath = buildLeakPhotoArchivePath(
            leakSegment,
            key,
            extension,
          );
          return archiveRoot === "photos"
            ? backupPath
            : `${archiveRoot}/${backupPath.slice("photos/".length)}`;
        },
      });
    }
  }

  return resolvePhotoCandidates(candidates, idbGet, photoReadCache);
}

export async function buildMonitoringPhotoEntries(
  orderedLeaks,
  leakSegments,
  idbGet,
  includedPhotoKeys = null,
  photoReadCache,
  archiveRoot = "photos",
) {
  const candidates = [];

  for (const [leakIndex, leak] of orderedLeaks.entries()) {
    const leakSegment = leakSegments[leakIndex];
    const records = getMonitoringRecords(leak);

    for (const [recordIndex, record] of records.entries()) {
      const mapKey = `monitoring:${leakIndex}:${recordIndex}`;
      if (includedPhotoKeys && !includedPhotoKeys.has(mapKey)) continue;
      if (!record.photo) continue;

      candidates.push({
        path: record.photo,
        mapKey,
        logicalKey: getMonitoringPhotoIdentity(
          leak,
          leakIndex,
          record,
          recordIndex,
        ),
        buildArchivePath: (extension) => {
          const backupPath = buildMonitoringPhotoArchivePath(
            leakSegment,
            recordIndex,
            extension,
          );
          return archiveRoot === "photos"
            ? backupPath
            : `${archiveRoot}/${backupPath.slice("photos/".length)}`;
        },
      });
    }
  }

  return resolvePhotoCandidates(candidates, idbGet, photoReadCache);
}

export function buildPhotoMap(photoEntries) {
  return Object.fromEntries(
    photoEntries.map((entry) => [entry.mapKey, entry.photoFileName]),
  );
}

export function buildPortableLeaks(leaks, photoMap) {
  return leaks.map((leak, leakIndex) => {
    const copy = { ...leak };
    for (const key of PHOTO_KEYS) {
      const photoFileName = photoMap[`${leakIndex}:${key}`];
      if (photoFileName) {
        copy[key] = `zip:${photoFileName}`;
      } else if (
        copy[key] != null &&
        !String(copy[key]).startsWith("data:image/")
      ) {
        delete copy[key];
      }
    }

    if (Array.isArray(copy.monitoringRecords)) {
      copy.monitoringRecords = copy.monitoringRecords.map(
        (record, recordIndex) => {
          const photoFileName =
            photoMap[`monitoring:${leakIndex}:${recordIndex}`];
          if (photoFileName) {
            return { ...record, photo: `zip:${photoFileName}` };
          }
          if (
            record?.photo == null ||
            String(record.photo).startsWith("data:image/")
          ) {
            return record;
          }
          const sanitizedRecord = { ...record };
          delete sanitizedRecord.photo;
          return sanitizedRecord;
        },
      );
    }

    return copy;
  });
}
