import { createArchivePhotoProxyReader } from "@/services/backup/archivePhotoProxyReader";
import {
  isWorkerUnavailableError,
  openBackupArchiveInWorker,
} from "@/services/excel/backupArchiveWorkerClient";
import { logger } from "@/utils/logger";
import { parseBackupZip } from "./archiveParser";

/**
 * Opens a backup archive for import, off the main thread when the platform
 * allows it. Returns exactly what parseBackupZip returns, so callers cannot
 * tell where the archive is being read.
 *
 * Falls back to parsing locally only when the worker could not run at all — an
 * archive the worker rejected on its merits is rejected here too, rather than
 * parsed a second time.
 */
export async function openArchive(file) {
  try {
    const { sizes, readPhoto, ...data } = await openBackupArchiveInWorker(file);
    return { ...data, photos: createArchivePhotoProxyReader(sizes, readPhoto) };
  } catch (error) {
    if (!isWorkerUnavailableError(error)) throw error;
    logger.warn(
      "Backup import worker unavailable, parsing on the main thread",
      {
        reason: String(error?.message ?? error),
      },
    );
    return parseBackupZip(file);
  }
}
