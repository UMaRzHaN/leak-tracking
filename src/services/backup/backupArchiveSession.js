import { createArchivePhotoProxyReader } from "@/services/backup/archivePhotoProxyReader";
import {
  isWorkerUnavailableError,
  openBackupArchiveInWorker,
} from "@/services/excel/backupArchiveWorkerClient";
import { logger } from "@/utils/logger";
import { parseBackupZip } from "./archiveParser";

/**
 * Отпускает архив, открытый openArchive, когда снимки из него больше не нужны.
 * У разбора в главном потоке закрывать нечего — там архив уходит со сборщиком
 * мусора вместе с читателем.
 *
 * @param {{close?: () => void} | null | undefined} photos
 */
export function releaseArchive(photos) {
  try {
    photos?.close?.();
  } catch (error) {
    logger.warn("Backup archive session could not be closed", error);
  }
}

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
    const { sizes, readPhoto, close, ...data } =
      await openBackupArchiveInWorker(file);
    const photos = createArchivePhotoProxyReader(sizes, readPhoto);
    return { ...data, photos: Object.assign(photos, { close }) };
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
