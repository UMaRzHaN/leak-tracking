import { parseDataImageUri } from "@/services/archive/archivePaths";
import { getPhotoSrc } from "@/hooks/photoService";
import { blobToDataUri } from "@/utils/photoConversion";

/**
 * Чтение снимков для книги: с устройства в память, порциями и не насмерть.
 *
 * Читателей несколько (колонки, обходы, лента), а файл у снимка может быть
 * один на всех, поэтому чтение идёт через общий кэш по опознавателю. Порции и
 * уступки главному потоку — чтобы выгрузка сотни утечек не подвешивала экран.
 */
const EXPORT_YIELD_EVERY = 40;
const PHOTO_READ_CONCURRENCY = 4;

/** @returns {Promise<void>} */
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

export async function resolvePhotoCandidates(
  candidates,
  idbGet,
  photoReadCache,
) {
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
