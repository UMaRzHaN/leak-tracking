import {
  applyColumnFormats,
  toExcelCellValue,
} from "@/services/excelExport/cellValues";
import {
  addStructuredTable,
  getColumnWidth,
  styleBodyRows,
  styleHeaderRow,
} from "@/services/excelExport/sheetLayout";

/**
 * The component registry, written as a sheet of the same workbook as the leaks.
 *
 * A sheet rather than a file of its own because the source the customer sent
 * keeps its three component tables in one book, and because the two datasets
 * describe the same field — splitting them would leave somebody to carry two
 * files that only mean anything together.
 *
 * Column order comes from the project config, which mirrors that source sheet
 * for sheet. Nothing is reordered here.
 */

const COMPONENT_TABLE_THEME = "TableStyleMedium3";
const PHOTO_KEY = "photo";

/**
 * @param {any} workbook
 * @param {{name: string, headers: string[], keysOrder: string[], rows: any[], ids?: string[]}} sheetSpec
 * @param {{photoPaths?: Record<string, string>, texts?: {photo?: {open?: string, missing?: string}}}} [options]
 *   `photoPaths` maps a card id to where its picture sits in the archive.
 */
export async function buildComponentSheet(
  workbook,
  sheetSpec,
  { photoPaths = {}, texts = {} } = {},
) {
  const { name, headers, keysOrder, rows, ids = [] } = sheetSpec ?? {};
  // No registry, or a project type that declares none: the workbook simply has
  // one sheet fewer, rather than an empty tab implying the walk found nothing.
  if (!name || !Array.isArray(rows) || rows.length === 0) return;

  const sheet = workbook.addWorksheet(name);
  const photoColumn = keysOrder.indexOf(PHOTO_KEY);

  /*
   * Ячейка со снимком заполняется отдельно, ссылкой. Раньше в неё попадал
   * сам путь хранения — «idb://photo_…», — который читателю не говорит
   * ничего, а на другом устройстве ещё и никуда не ведёт.
   */
  const tableRows = rows.map((row, index) =>
    keysOrder.map((key) =>
      key === PHOTO_KEY && photoPaths[ids[index]]
        ? ""
        : toExcelCellValue(key, row[key]),
    ),
  );

  addStructuredTable(sheet, {
    name: "Components",
    headers,
    rows: tableRows,
    theme: COMPONENT_TABLE_THEME,
  });
  styleHeaderRow(sheet, "FF31859B");
  await styleBodyRows(sheet, rows.length);
  if (photoColumn !== -1) {
    for (const [rowIndex, row] of rows.entries()) {
      const archivePath = photoPaths[ids[rowIndex]];
      const cell = sheet.getRow(rowIndex + 2).getCell(photoColumn + 1);

      if (archivePath) {
        cell.value = {
          text: texts.photo?.open ?? archivePath,
          hyperlink: archivePath,
        };
        cell.font = { color: { argb: "FF1155CC" }, underline: true };
      } else {
        // Снимок был, но прочитать его не удалось: сказать об этом честнее,
        // чем оставить пустую ячейку рядом с заполненной карточкой.
        cell.value = row[PHOTO_KEY] ? (texts.photo?.missing ?? "") : "";
      }
    }
  }

  applyColumnFormats(sheet, keysOrder);

  keysOrder.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
      {
        isPhoto: key === PHOTO_KEY,
      },
    );
  });
}

/**
 * Flattens registry records into export rows.
 *
 * Runs on the main thread, before the payload crosses into the worker: the
 * records are plain data, and the worker has no way to reach storage.
 *
 * @param {object[]} components
 * @param {string[]} keysOrder
 */
export function buildComponentRows(components, keysOrder) {
  return (components ?? []).map((component, index) => {
    const row = {};
    for (const key of keysOrder) {
      row[key] = key === "index" ? index + 1 : (component[key] ?? "");
    }
    return row;
  });
}

/**
 * The card ids behind the rows, in the same order.
 *
 * The sheet has no id column — a UUID is nothing to a reader — but the photo
 * link has to find the picture belonging to the row it is on, so the identity
 * travels alongside the rows instead of in them.
 */
export function buildComponentRowIds(components) {
  return (components ?? []).map((component) => component?.id);
}
