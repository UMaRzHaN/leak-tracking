import { buildInventoryWorkbookBufferInWorker } from "@/services/excel/excelWorkerClient";
import { getJSZip } from "@/services/backup/runtime";
import { sanitizePortableArchiveSegment } from "@/services/archive/archivePaths";

/**
 * The inventory as an archive of its own.
 *
 * Separate from the leak export on purpose, and for the same reason the
 * registry is a separate entity: the walk that counts the equipment and the
 * work that reports the leaks are two jobs, done by different people at
 * different times, and handed over separately. Whoever receives the inventory
 * should not have to open a leak report to find it.
 *
 * The layout is chosen for a person with a zip open, not for a parser:
 *
 *   !Inventorization_<project>.xlsx   листы для чтения и служебный — для машины
 *   Photos/                           по снимку на карточку, названы её номером
 *   Schemes/                          чертежи под своими именами
 *
 * Как у отчёта по утечкам: один файл, который открывают и читают, и он же
 * возвращается обратно без потерь. Карточки целиком — с историей, подписями и
 * ссылками на снимки — лежат скрытым листом внутри книги, а не отдельным
 * json рядом: json рядом с книгой выглядит как черновик, забытый в архиве.
 */

export {
  INVENTORY_PHOTO_DIR,
  INVENTORY_SCHEMA_DIR,
  INVENTORY_SHEET_NAME,
} from "@/services/inventory/inventoryNames";

/** `!Inventorization_<project>`, safe as a file name on any of the platforms. */
export function buildInventoryFileStem(projectName) {
  return (
    sanitizePortableArchiveSegment(
      `!Inventorization_${projectName || "no_name"}`,
    ) || "!Inventorization"
  );
}

/**
 * Assembles the archive.
 *
 * @param {object} options
 * @param {string} options.fileStem
 * @param {{name?: string, headers: string[], keysOrder: string[], rows: Record<string, any>[], ids?: string[], components?: Record<string, any>[], fields?: {key?: string, label?: string}[]}} options.sheetSpec rows and headers for the sheet
 * @param {{photoEntries?: {path: string, blob: Blob}[], photoPaths?: Record<string, string>, components?: Record<string, any>[]}|null} options.registryEntry
 * @param {{path: string, blob: Blob}[]} [options.schemaEntries]
 * @param {Record<string, any>} [options.texts] подписи для ячейки со снимком
 * @returns {Promise<Blob>}
 */
export async function buildInventoryArchive({
  fileStem,
  sheetSpec,
  registryEntry,
  schemaEntries = [],
  texts = {},
}) {
  const JSZip = (await getJSZip()).default;
  const zip = new JSZip();

  // Колонка «Фото» ссылается в ту же папку Photos, что лежит рядом: открыв
  // книгу из распакованного архива, снимок открывают нажатием на ячейку.
  zip.file(
    `${fileStem}.xlsx`,
    await buildInventoryWorkbookBufferInWorker(sheetSpec, {
      photoPaths: registryEntry?.photoPaths ?? {},
      backup: registryEntry?.components ?? [],
      texts,
    }),
  );

  for (const entry of registryEntry?.photoEntries ?? []) {
    zip.file(entry.path, entry.blob);
  }

  for (const entry of schemaEntries) zip.file(entry.path, entry.blob);

  return zip.generateAsync({ type: "blob" });
}
