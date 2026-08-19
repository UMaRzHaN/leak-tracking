import { buildComponentSheet } from "@/services/excelExport/componentSheet";
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
 *   !Inventorization_<project>.xlsx   the sheet, for reading
 *   components.json                   the same cards, for merging back
 *   Photos/                           one picture per card, named by its number
 *   Schemes/                          the drawings, under their own names
 *
 * `components.json` and `Photos/` are exactly what a project archive carries,
 * so an inventory archive imports through the path that already exists.
 */

export const INVENTORY_SHEET_NAME = "Inventorization";
export const INVENTORY_PHOTO_DIR = "Photos";
export const INVENTORY_SCHEMA_DIR = "Schemes";

const getExcelJS = () => import("exceljs");
const getJSZip = () => import("jszip");

/** `!Inventorization_<project>`, safe as a file name on any of the platforms. */
export function buildInventoryFileStem(projectName) {
  return (
    sanitizePortableArchiveSegment(
      `!Inventorization_${projectName || "no_name"}`,
    ) || "!Inventorization"
  );
}

/**
 * A workbook holding nothing but the registry sheet.
 *
 * Written here rather than through the leak export's worker because there is
 * one sheet and no photographs to resolve: the worker exists to keep a
 * thousand-record report off the main thread, and paying its round trip for a
 * single table would be slower, not faster.
 *
 * @param {{name?: string, headers: string[], keysOrder: string[], rows: object[], ids?: string[]}} sheetSpec
 * @param {{photoPaths?: Record<string, string>, texts?: object}} [options]
 */
export async function buildInventoryWorkbookBuffer(sheetSpec, options = {}) {
  const ExcelJS = (await getExcelJS()).default;
  const workbook = new ExcelJS.Workbook();
  await buildComponentSheet(
    workbook,
    { ...sheetSpec, name: INVENTORY_SHEET_NAME },
    options,
  );
  return workbook.xlsx.writeBuffer();
}

/**
 * Assembles the archive.
 *
 * @param {object} options
 * @param {string} options.fileStem
 * @param {object} options.sheetSpec rows and headers for the sheet
 * @param {{path: string, content: string, photoEntries?: {path: string, blob: Blob}[], photoPaths?: Record<string, string>}|null} options.registryEntry
 * @param {{path: string, blob: Blob}[]} [options.schemaEntries]
 * @param {object} [options.texts] подписи для ячейки со снимком
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
    await buildInventoryWorkbookBuffer(sheetSpec, {
      photoPaths: registryEntry?.photoPaths ?? {},
      texts,
    }),
  );

  if (registryEntry) {
    zip.file(registryEntry.path, registryEntry.content);
    for (const entry of registryEntry.photoEntries ?? []) {
      zip.file(entry.path, entry.blob);
    }
  }

  for (const entry of schemaEntries) zip.file(entry.path, entry.blob);

  return zip.generateAsync({ type: "blob" });
}
