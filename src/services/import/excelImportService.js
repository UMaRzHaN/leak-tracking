import {
  parseExcelImportFile as parseExcelImportFileLocally,
  parseExcelLeaks,
} from "@/services/import/excelImportParse";
import {
  isWorkerUnavailableError,
  parseExcelImportFileInWorker,
} from "@/services/excel/excelWorkerClient";
import { logger } from "@/utils/logger";

// Main-thread entry point for the Excel import. Parsing lives in
// excelImportParse.js so the worker can load it without the photo pipeline's
// Capacitor dependency; the photo steps re-exported below run after parsing,
// on the main thread, and stay there.
export { parseExcelLeaks };
export {
  persistExcelImportPhotos,
  reconcileExcelImportPhotos,
} from "@/services/import/photoPipeline";

/**
 * Parses an Excel or ZIP import off the main thread when the platform allows
 * it. Decompressing an archive full of photos blocks whatever thread it runs
 * on, and on the main thread that is the whole UI.
 *
 * Falls back to parsing locally only when the worker could not run at all —
 * a file the worker rejected is rejected here too, rather than parsed twice.
 */
export async function parseExcelImportFile(file, options = {}) {
  try {
    return await parseExcelImportFileInWorker(file, options);
  } catch (error) {
    if (!isWorkerUnavailableError(error)) throw error;
    logger.warn("Import worker unavailable, parsing on the main thread", {
      reason: String(error?.message ?? error),
    });
    return parseExcelImportFileLocally(file, options);
  }
}
