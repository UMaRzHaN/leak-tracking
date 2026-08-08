import { getImageMimeTypeFromExtension } from "@/services/archive/archivePaths";
import { readArchiveEntry } from "@/utils/importLimits";

const ARCHIVE_PATH_PREFIX = "zip:";

export function isArchivePhotoPath(path) {
  return typeof path === "string" && path.startsWith(ARCHIVE_PATH_PREFIX);
}

/**
 * The only view of an import archive that survives past parsing.
 *
 * parseBackupZip used to hand its live JSZip instance to the caller, which
 * meant every consumer knew it was reading a ZIP — and, more importantly, that
 * the parse result could never cross a Web Worker boundary, since a JSZip
 * instance is not structured-cloneable. Everything downstream actually needs
 * is these two operations, so that is all this exposes.
 */
export function createArchivePhotoReader(zip) {
  const entryFor = (path) =>
    isArchivePhotoPath(path)
      ? zip.file(path.slice(ARCHIVE_PATH_PREFIX.length))
      : null;

  return {
    has(path) {
      return Boolean(entryFor(path));
    },

    /**
     * Size the archive claims for an entry, used to pick a read concurrency
     * before anything is decompressed. Header-declared and therefore
     * untrusted — the real limits are enforced during read().
     */
    declaredSize(path) {
      const size = Number(entryFor(path)?._data?.uncompressedSize);
      return Number.isFinite(size) && size > 0 ? size : 0;
    },

    /**
     * Declared size of every entry, keyed by archive path. The worker sends
     * this across once, because declaredSize() is synchronous and a proxy
     * cannot ask another thread a synchronous question.
     */
    declaredSizes() {
      const sizes = {};
      for (const entry of Object.values(zip?.files ?? {})) {
        if (entry.dir) continue;
        const size = Number(entry?._data?.uncompressedSize);
        sizes[`${ARCHIVE_PATH_PREFIX}${entry.name}`] =
          Number.isFinite(size) && size > 0 ? size : 0;
      }
      return sizes;
    },

    /** Decompresses one photo, typed by its extension. Null when absent. */
    async read(path) {
      const entry = entryFor(path);
      if (!entry) return null;
      const relativePath = path.slice(ARCHIVE_PATH_PREFIX.length);
      const blob = await readArchiveEntry(zip, entry, "blob");
      const mime = getImageMimeTypeFromExtension(
        relativePath.split(".").pop() || "jpg",
      );
      return blob.type === mime ? blob : new Blob([blob], { type: mime });
    },
  };
}
