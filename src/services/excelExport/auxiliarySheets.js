import {
  applyColumnFormats,
  parseTimestamp,
  toExcelCellValue,
} from "./cellValues";
import {
  buildMonitoringRoundLookup,
  getMonitoringExportRows,
} from "./monitoringRows";
import { getRepairExportRows } from "./repairRows";
import { getMaterialsExportRows } from "./materialsRows";
import {
  addStructuredTable,
  getColumnWidth,
  styleBodyRows,
  styleHeaderRow,
  writePhotoLinks,
} from "./sheetLayout";

const MONITORING_TABLE_THEME = "TableStyleMedium4";

export function buildHistoryRows(orderedLeaks, texts) {
  const fallbackUser = texts.history.unknownUser;
  const getHistoryUser = (entry, leak) =>
    entry.user ??
    entry.monitoredBy ??
    entry.detectedBy ??
    leak.detectedBy ??
    leak.monitoredBy ??
    fallbackUser;

  return orderedLeaks.flatMap((leak, leakIndex) =>
    (Array.isArray(leak.history) ? leak.history : []).map((entry) => ({
      index: leak.index ?? leakIndex + 1,
      leak_id: leak.leak_id ?? "",
      date: parseTimestamp(entry.date) ?? "",
      time: parseTimestamp(entry.date) ?? "",
      action: entry.action ?? "",
      user: getHistoryUser(entry, leak),
      text: entry.text ?? "",
      to: entry.to ?? "",
      changes: Array.isArray(entry.changes)
        ? JSON.stringify(entry.changes)
        : "",
    })),
  );
}

export async function buildHistorySheet(workbook, orderedLeaks, texts) {
  const rows = buildHistoryRows(orderedLeaks, texts);
  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(texts.sheets.history);
  const keys = [
    "index",
    "leak_id",
    "date",
    "time",
    "action",
    "user",
    "text",
    "to",
    "changes",
  ];
  const headers = keys.map((key) => texts.history.headers[key]);

  const tableRows = rows.map((row) =>
    keys.map((key) => toExcelCellValue(key, row[key])),
  );

  addStructuredTable(sheet, {
    name: "History",
    headers,
    rows: tableRows,
    theme: "TableStyleMedium9",
  });
  styleHeaderRow(sheet, "FF8064A2");
  await styleBodyRows(sheet, rows.length);
  applyColumnFormats(sheet, keys);

  keys.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
    );
  });
}

/** Осмотр до появления вопроса ответа не имеет — клетка остаётся пустой. */
function formatMonitoringFlag(value, texts) {
  if (typeof value !== "boolean") return "";
  return value ? texts.monitoring.flags.yes : texts.monitoring.flags.no;
}

export async function buildMonitoringSheet(
  workbook,
  orderedLeaks,
  texts,
  photoMap,
  monitoringExportMode,
) {
  const roundLookup = buildMonitoringRoundLookup(orderedLeaks);
  const rows = getMonitoringExportRows(
    orderedLeaks,
    roundLookup,
    monitoringExportMode,
  ).map((row) => ({
    ...row,
    date: parseTimestamp(row.dateRaw) ?? "",
    time: parseTimestamp(row.dateRaw) ?? "",
    result: texts.monitoring.answers[row.result] ?? String(row.result ?? ""),
    physicalTag: formatMonitoringFlag(row.physicalTag, texts),
    fiction: formatMonitoringFlag(row.fiction, texts),
  }));

  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(texts.sheets.monitoring);
  const keys = [
    "index",
    "leak_id",
    "roundNumber",
    "date",
    "time",
    "monitoredBy",
    "result",
    "physicalTag",
    "fiction",
    "materials_equipment",
    "comment",
    "photo",
    "previousPhoto",
  ];
  const headers = keys.map((key) => texts.monitoring.headers[key]);

  const tableRows = rows.map((row) =>
    keys.map((key) => {
      if (key === "photo" && photoMap[row.photoMapKey]) return "";
      if (key === "previousPhoto" && photoMap[row.previousPhotoMapKey]) {
        return "";
      }
      return toExcelCellValue(key, row[key]);
    }),
  );

  addStructuredTable(sheet, {
    name: "Monitoring",
    headers,
    rows: tableRows,
    theme: MONITORING_TABLE_THEME,
  });
  styleHeaderRow(sheet, "FF548235");
  await styleBodyRows(sheet, rows.length);

  await writePhotoLinks(
    sheet,
    rows,
    keys,
    [
      ["photo", "photoMapKey"],
      ["previousPhoto", "previousPhotoMapKey"],
    ],
    photoMap,
    texts,
  );

  applyColumnFormats(sheet, keys);

  keys.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
      { isPhoto: key === "photo" || key === "previousPhoto" },
    );
  });
}

/**
 * Лист ремонтов: строка на попытку, со ссылками на снимки.
 *
 * Ссылка ставится только там, где файл в книге действительно есть. Снимок,
 * который прочитать не удалось, отмечается словами — обещать открытие того,
 * чего в архиве нет, хуже, чем сказать об этом прямо.
 */
export async function buildRepairSheet(
  workbook,
  orderedLeaks,
  texts,
  photoMap,
) {
  const rows = getRepairExportRows(orderedLeaks).map((row) => ({
    ...row,
    repairAt: parseTimestamp(row.repairAt) ?? "",
    repairTime: parseTimestamp(row.repairTime) ?? "",
    resolvedAt: parseTimestamp(row.resolvedAt) ?? "",
    resolvedTime: parseTimestamp(row.resolvedTime) ?? "",
  }));
  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(texts.sheets.repairs);
  const keys = [
    "index",
    "leak_id",
    "attempt",
    "repairAt",
    "repairTime",
    "resolvedAt",
    "resolvedTime",
    "durationHours",
    "user",
    "brigade",
    "materials_equipment",
    "note",
    "repairPhoto",
    "donePhoto",
  ];
  const photoColumns = [
    ["repairPhoto", "repairPhotoMapKey"],
    ["donePhoto", "donePhotoMapKey"],
  ];
  const headers = keys.map((key) => texts.repairs.headers[key]);
  const map = photoMap ?? {};

  addStructuredTable(sheet, {
    name: "Repairs",
    headers,
    rows: rows.map((row) =>
      keys.map((key) => {
        // Ячейку со ссылкой заполняет отдельный проход ниже: таблица строится
        // из значений, а гиперссылка — свойство самой ячейки.
        if (key === "repairPhoto" || key === "donePhoto") return "";
        return toExcelCellValue(key, row[key]);
      }),
    ),
    theme: "TableStyleMedium3",
  });
  styleHeaderRow(sheet, "FFC55A11");
  await styleBodyRows(sheet, rows.length);

  await writePhotoLinks(sheet, rows, keys, photoColumns, map, texts);

  applyColumnFormats(sheet, keys);

  keys.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
      { isPhoto: key === "repairPhoto" || key === "donePhoto" },
    );
  });
}

/** «Расход МТР» (8a): что и когда поставили, из ремонтов и осмотров. */
export async function buildMaterialsSheet(workbook, orderedLeaks, texts) {
  const rows = getMaterialsExportRows(orderedLeaks).map((row) => ({
    ...row,
    date: parseTimestamp(row.dateRaw) ?? "",
    time: parseTimestamp(row.dateRaw) ?? "",
    source: texts.materials.sources[row.source] ?? row.source,
  }));
  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(texts.sheets.materials);
  const keys = [
    "index",
    "leak_id",
    "date",
    "time",
    "source",
    "materials_equipment",
    "user",
  ];
  const headers = keys.map((key) => texts.materials.headers[key]);

  addStructuredTable(sheet, {
    name: "Materials",
    headers,
    rows: rows.map((row) => keys.map((key) => toExcelCellValue(key, row[key]))),
    theme: "TableStyleMedium7",
  });
  styleHeaderRow(sheet, "FF548235");
  await styleBodyRows(sheet, rows.length);
  applyColumnFormats(sheet, keys);

  keys.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
    );
  });
}

/**
 * «Приёмка оборудования»: строка на позицию в партии — что пришло в этот
 * раз, сколько набралось по позиции и сколько осталось по накладной.
 */
export async function buildAcceptanceSheet(workbook, acceptanceRows, texts) {
  const { acceptance } = texts;
  const rows = (acceptanceRows ?? []).map((row) => ({
    ...row,
    date: parseTimestamp(row.dateRaw) ?? "",
    time: parseTimestamp(row.dateRaw) ?? "",
    status: acceptance.statuses[row.status] ?? row.status,
    unit: acceptance.units[row.unit] ?? row.unit,
    complete: row.complete ? acceptance.yes : acceptance.no,
    dnpnMatch: row.dnpnMatch ? acceptance.yes : acceptance.no,
  }));
  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(texts.sheets.acceptance);
  const keys = [
    "invoice",
    "supplier",
    "warehouse",
    "status",
    "batch",
    "date",
    "time",
    "name",
    "unit",
    "ordered",
    "qty",
    "received",
    "left",
    "complete",
    "dnpnMatch",
    "remark",
    "user",
  ];
  const headers = keys.map((key) => acceptance.headers[key]);

  addStructuredTable(sheet, {
    name: "Acceptance",
    headers,
    rows: rows.map((row) => keys.map((key) => toExcelCellValue(key, row[key]))),
    theme: "TableStyleMedium4",
  });
  styleHeaderRow(sheet, "FF2F5597");
  await styleBodyRows(sheet, rows.length);
  applyColumnFormats(sheet, keys);

  keys.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
    );
  });
}
