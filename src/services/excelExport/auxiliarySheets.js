import { getMonitoringAnswerLabel } from "@/utils/monitoring";
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

export function buildHistoryRows(orderedLeaks, lang) {
  const fallbackUser = lang === "ru" ? "Не указан" : "Unknown";
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

export async function buildHistorySheet(workbook, orderedLeaks, lang) {
  const rows = buildHistoryRows(orderedLeaks, lang);
  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(
    lang === "ru" ? "История" : "Leak History",
  );
  const headers =
    lang === "ru"
      ? [
          "№",
          "Бирка",
          "Дата",
          "Время",
          "Действие",
          "Пользователь",
          "Текст",
          "Статус",
          "Изменения JSON",
        ]
      : [
          "No.",
          "Tag",
          "Date",
          "Time",
          "Action",
          "User",
          "Text",
          "Status",
          "Changes JSON",
        ];
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
  lang,
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
    result: getMonitoringAnswerLabel(row.result, lang),
  }));

  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(
    lang === "ru" ? "Мониторинг" : "Monitoring",
  );
  const headers =
    lang === "ru"
      ? [
          "№",
          "Бирка",
          "Обход",
          "Дата мониторинга",
          "Время мониторинга",
          "Кто мониторил",
          "Утечка есть",
          "МТР",
          "Комментарий",
        ]
      : [
          "No.",
          "Tag",
          "Round",
          "Monitoring date",
          "Monitoring time",
          "Monitored by",
          "Leak present",
          "Materials",
          "Comment",
        ];
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
  ];

  headers.push(lang === "ru" ? "Фото мониторинга" : "Monitoring photo");
  keys.push("photo");

  const tableRows = rows.map((row) =>
    keys.map((key) => {
      if (key === "photo" && photoMap[row.photoMapKey]) return "";
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

    const photoColumnIndex = keys.indexOf("photo") + 1;
    const photoFile = photoMap[row.photoMapKey];
    const photoCell = sheet.getRow(rowIndex + 2).getCell(photoColumnIndex);

    if (photoFile) {
      photoCell.value = {
        text: lang === "ru" ? "Открыть фото" : "Open photo",
        hyperlink: photoFile,
      };
      photoCell.font = { color: { argb: "FF1155CC" }, underline: true };
    } else {
      photoCell.value = row.photo
        ? lang === "ru"
          ? "Есть (файл не найден)"
          : "Present (file missing)"
        : "";
    }
  }

  applyColumnFormats(sheet, keys);

  keys.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
      { isPhoto: key === "photo" },
    );
  });
}
