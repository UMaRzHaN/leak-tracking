import {
  applyColumnFormats,
  parseTimestamp,
  toExcelCellValue,
} from "./cellValues";
import {
  buildMonitoringRoundLookup,
  getMonitoringExportRows,
} from "./monitoringRows";
import {
  addStructuredTable,
  getColumnWidth,
  styleBodyRows,
  styleHeaderRow,
  yieldToMainThread,
} from "./sheetLayout";

const MONITORING_TABLE_THEME = "TableStyleMedium4";
const EXPORT_YIELD_EVERY = 40;

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

  for (const [rowIndex, row] of rows.entries()) {
    if (rowIndex > 0 && rowIndex % EXPORT_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }

    for (const [key, mapKey] of [
      ["photo", row.photoMapKey],
      ["previousPhoto", row.previousPhotoMapKey],
    ]) {
      const photoColumnIndex = keys.indexOf(key) + 1;
      const photoFile = photoMap[mapKey];
      const photoCell = sheet.getRow(rowIndex + 2).getCell(photoColumnIndex);

      if (photoFile) {
        photoCell.value = { text: texts.photo.open, hyperlink: photoFile };
        photoCell.font = { color: { argb: "FF1155CC" }, underline: true };
      } else {
        photoCell.value = row[key] ? texts.photo.missing : "";
      }
    }
  }

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
