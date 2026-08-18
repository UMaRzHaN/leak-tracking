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

/**
 * @param {any} workbook
 * @param {{name: string, headers: string[], keysOrder: string[], rows: any[]}} sheetSpec
 */
export async function buildComponentSheet(workbook, sheetSpec) {
  const { name, headers, keysOrder, rows } = sheetSpec ?? {};
  // No registry, or a project type that declares none: the workbook simply has
  // one sheet fewer, rather than an empty tab implying the walk found nothing.
  if (!name || !Array.isArray(rows) || rows.length === 0) return;

  const sheet = workbook.addWorksheet(name);

  const tableRows = rows.map((row) =>
    keysOrder.map((key) => toExcelCellValue(key, row[key])),
  );

  addStructuredTable(sheet, {
    name: "Components",
    headers,
    rows: tableRows,
    theme: COMPONENT_TABLE_THEME,
  });
  styleHeaderRow(sheet, "FF31859B");
  await styleBodyRows(sheet, rows.length);
  applyColumnFormats(sheet, keysOrder);

  keysOrder.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
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
