import { parseExcelImportFileInWorker } from "@/services/excel/excelWorkerClient";

// Main-thread entry point for the Excel import. Parsing lives in
// excelImportParse.js so the worker can load it without the photo pipeline's
// Capacitor dependency; the photo steps re-exported below run after parsing,
// on the main thread, and stay there.
export {
  persistExcelImportPhotos,
  reconcileExcelImportPhotos,
} from "@/services/import/photoPipeline";

/**
 * Parses an Excel or ZIP import off the main thread. Decompressing an archive
 * full of photos blocks whatever thread it runs on, and on the main thread
 * that is the whole UI.
 *
 * Разбирать здесь же, если воркер не завёлся, приложение больше не умеет, и
 * это решение, а не упущение: запасной путь тянул в граф вторую копию ExcelJS
 * — 900 кБ, которые сервис-воркер клал в кэш каждому ради случая, который на
 * поддерживаемых WebView не наступает. Отказ воркера теперь означает
 * сломанную сборку, и человеку честнее увидеть ошибку, чем ждать, пока
 * подвиснет интерфейс.
 */
export function parseExcelImportFile(file, options = {}) {
  return parseExcelImportFileInWorker(file, options);
}
