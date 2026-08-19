import {
  findHeaderRow,
  getCellDisplayValue,
  normalizeHeader,
} from "@/services/import/workbookSchema";

/**
 * Reading an inventory back out of a spreadsheet.
 *
 * The customer's own "Database component.xlsx" is a spreadsheet, and so is
 * every file that leaves this app; a walk that started in Excel has to be able
 * to come in. The archive route (`components.json`) is richer and is preferred
 * wherever it exists — this is the fallback for a bare workbook.
 *
 * Identity is the catch. A sheet carries no UUIDs, only the number the walker
 * wrote on the equipment, so a row is identified by that number. Rows without
 * one cannot be recognised on a second import and are treated as new; that is
 * stated here rather than hidden, because importing the same sheet twice and
 * silently doubling the registry would be worse than saying so.
 */

const SHEET_NAMES = new Set(
  ["inventorization", "inventory", "компоненты", "components"].map(
    normalizeHeader,
  ),
);

/** The sheet the inventory export writes, under any of its names. */
export function isInventorySheet(sheet) {
  return SHEET_NAMES.has(normalizeHeader(sheet?.name));
}

function buildHeaderMap(headers, keysOrder) {
  const entries = new Map();
  headers.forEach((header, index) => {
    const key = keysOrder[index];
    if (key) entries.set(normalizeHeader(header), key);
  });
  return entries;
}

/** A row's own number is the only identity a spreadsheet can offer. */
export function componentIdFromUid(uid) {
  return `uid:${String(uid).trim()}`;
}

/**
 * Locates the registry sheet in a workbook.
 *
 * By name first, because that is what the export writes. A workbook whose tab
 * was renamed still passes if its header row reads like a registry — the two
 * columns nothing else has are the component's own number and its drawing tag.
 */
export function findInventorySheet(workbook, headerMap) {
  const byName = workbook.worksheets.find(
    (sheet) => sheet.rowCount > 0 && isInventorySheet(sheet),
  );
  if (byName && findHeaderRow(byName, headerMap)) return byName;

  return workbook.worksheets.find((sheet) => {
    if (!sheet.rowCount) return false;
    const header = findHeaderRow(sheet, headerMap);
    return Boolean(
      header?.columns.some((column) => column.key === "component_uid") &&
      header?.columns.some((column) => column.key === "scheme_tag"),
    );
  });
}

/**
 * Rows of the registry sheet as component cards.
 *
 * `index` is dropped: it is the row number the export writes for a reader, not
 * data about the equipment, and carrying it back in would put a stale ordinal
 * on every card.
 *
 * @param {any} workbook an opened ExcelJS workbook
 * @param {{headers: string[], keysOrder: string[]}} excel the registry's column declaration
 * @param {{now?: number}} [options]
 * @returns {{components: object[], skipped: number}}
 */
export function parseInventorySheet(
  workbook,
  excel,
  { now = Date.now() } = {},
) {
  const headerMap = buildHeaderMap(excel.headers, excel.keysOrder);
  const sheet = findInventorySheet(workbook, headerMap);
  if (!sheet) return { components: [], skipped: 0 };

  const header = findHeaderRow(sheet, headerMap);
  if (!header) return { components: [], skipped: 0 };

  const components = [];
  let skipped = 0;

  for (
    let rowNumber = header.rowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const card = {};

    for (const column of header.columns) {
      if (column.key === "index") continue;
      const value = getCellDisplayValue(row.getCell(column.columnNumber));
      if (value === "" || value == null) continue;
      card[column.key] =
        value instanceof Date ? value.getTime() : String(value).trim();
    }

    // A row with nothing but formatting on it is not a component.
    if (Object.keys(card).length === 0) continue;

    const uid = String(card.component_uid ?? "").trim();
    if (!uid) {
      skipped += 1;
      continue;
    }

    components.push({
      ...card,
      component_uid: uid,
      id: componentIdFromUid(uid),
      updatedAt: now,
    });
  }

  return { components, skipped };
}
