import { PROJECTS } from "@/configs/projects";
import {
  HEADER_ALIASES,
  HISTORY_HEADER_ALIASES,
  MONITORING_HEADER_ALIASES,
  TECHNICAL_KEYS,
} from "@/services/import/workbookHeaderAliases";

// `№` разворачивается в слово, а не вычёркивается вместе с прочей пунктуацией:
// вычеркнутый, он оставлял от заголовка «№» пустую строку. «№ бирки» при этом
// даёт «номер бирки» — как эту колонку и подписывают руками.
export function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/№/g, " номер ")
    .replace(/ё/g, "е")
    .replace(/[_/\\()[\]{}:;.,'"`%+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Кладёт заголовок в карту, пропуская те, что нормализуются в пустую строку.
 *
 * Пустой ключ означал бы, что распознанным заголовком считается любая пустая
 * ячейка: строка данных с десятком пустот обходила настоящую шапку, `leak_id`
 * в найденной не было, и лист утечек отбраковывался целиком.
 *
 * @param {Map<string, string>} entries
 * @param {unknown} header
 * @param {string} key
 */
function setHeaderEntry(entries, header, key) {
  const normalized = normalizeHeader(header);
  if (normalized) entries.set(normalized, key);
}

export function buildHeaderMap(projectType) {
  const config = PROJECTS[projectType]?.export?.excel;
  const entries = new Map();

  for (const key of TECHNICAL_KEYS) {
    setHeaderEntry(entries, key, key);
  }

  if (config?.headers && config?.keysOrder) {
    config.headers.forEach((header, index) => {
      const key = config.keysOrder[index];
      if (key) setHeaderEntry(entries, header, key);
    });
  }

  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    aliases.forEach((alias) => setHeaderEntry(entries, alias, key));
  }

  return entries;
}

export function buildMonitoringHeaderMap() {
  const entries = new Map();
  for (const [key, aliases] of Object.entries(MONITORING_HEADER_ALIASES)) {
    setHeaderEntry(entries, key, key);
    aliases.forEach((alias) => setHeaderEntry(entries, alias, key));
  }
  return entries;
}

export function buildHistoryHeaderMap() {
  const entries = new Map();
  for (const [key, aliases] of Object.entries(HISTORY_HEADER_ALIASES)) {
    setHeaderEntry(entries, key, key);
    aliases.forEach((alias) => setHeaderEntry(entries, alias, key));
  }
  return entries;
}

export function getCellDisplayValue(cell) {
  if (!cell) return "";
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return value.result;
    if ("hyperlink" in value && "text" in value) return value.text;
    if ("hyperlink" in value) return value.hyperlink;
    if ("text" in value) return value.text;
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
  }
  return value;
}

// Экспорт пишет цели гиперссылок через `/`, но Excel при пересохранении книги
// на Windows переписывает часть из них в виндовый вид (`photos\TAG-1\before.jpg`).
// Внутри ZIP разделитель всегда `/`, поэтому путь приводится к нему до проверки
// и до превращения в `zip:`-ссылку — иначе фото молча выпадает из импорта.
function normalizeArchiveSeparators(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function getCellPhotoValue(cell) {
  const value = cell?.value;
  if (value && typeof value === "object" && "hyperlink" in value) {
    return normalizeArchiveSeparators(value.hyperlink);
  }
  return normalizeArchiveSeparators(getCellDisplayValue(cell));
}

/**
 * @typedef {{columnNumber: number, key: string, header: string}} HeaderColumn
 * @typedef {{rowNumber: number, recognized: number, columns: HeaderColumn[]}} HeaderRow
 */

/** @returns {HeaderRow|null} */
export function findHeaderRow(sheet, headerMap) {
  let best = /** @type {HeaderRow|null} */ (null);
  const maxRow = Math.min(sheet.rowCount, 30);

  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const columns = /** @type {HeaderColumn[]} */ ([]);
    let recognized = 0;

    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const raw = getCellDisplayValue(cell);
      const key = headerMap.get(normalizeHeader(raw));
      if (key) {
        recognized += 1;
        columns.push({ columnNumber, key, header: String(raw ?? "").trim() });
      }
    });

    if (!best || recognized > best.recognized) {
      best = { rowNumber, recognized, columns };
    }
  }

  return best && best.recognized >= 2 ? best : null;
}

function isMonitoringSheet(sheet) {
  const name = normalizeHeader(sheet?.name);
  return name === "мониторинг" || name === "monitoring";
}

function isHistorySheet(sheet) {
  const name = normalizeHeader(sheet?.name);
  return name === "история" || name === "history" || name === "leak history";
}

export function findLeakSheet(workbook, headerMap) {
  let best = /** @type {{sheet: any, header: HeaderRow}|null} */ (null);
  for (const sheet of workbook.worksheets) {
    if (!sheet.rowCount || isMonitoringSheet(sheet) || isHistorySheet(sheet)) {
      continue;
    }
    const header = findHeaderRow(sheet, headerMap);
    if (!header?.columns.some((column) => column.key === "leak_id")) continue;
    if (!best || header.recognized > best.header.recognized) {
      best = { sheet, header };
    }
  }
  return best?.sheet;
}

export function findMonitoringSheet(workbook) {
  const monitoringHeaderMap = buildMonitoringHeaderMap();
  const byName = workbook.worksheets.find(
    (sheet) => sheet.rowCount > 0 && isMonitoringSheet(sheet),
  );
  if (byName && findHeaderRow(byName, monitoringHeaderMap)) return byName;

  return workbook.worksheets.find((sheet) => {
    if (!sheet.rowCount) return false;
    const header = findHeaderRow(sheet, monitoringHeaderMap);
    return Boolean(
      header?.columns.some((column) => column.key === "roundNumber") &&
      header?.columns.some((column) => column.key === "leak_id"),
    );
  });
}

export function findHistorySheet(workbook) {
  const historyHeaderMap = buildHistoryHeaderMap();
  const byName = workbook.worksheets.find(
    (sheet) => sheet.rowCount > 0 && isHistorySheet(sheet),
  );
  if (byName && findHeaderRow(byName, historyHeaderMap)) return byName;

  return workbook.worksheets.find((sheet) => {
    if (!sheet.rowCount || isMonitoringSheet(sheet)) return false;
    const header = findHeaderRow(sheet, historyHeaderMap);
    return Boolean(
      header?.columns.some((column) => column.key === "action") &&
      header?.columns.some((column) => column.key === "leak_id"),
    );
  });
}
