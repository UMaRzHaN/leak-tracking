import { combineDateAndTime, formatTime, parseDateValue } from "./cellDates";
import {
  buildHistoryHeaderMap,
  buildMonitoringHeaderMap,
  findHeaderRow,
  getCellDisplayValue,
  getCellPhotoValue,
} from "./workbookSchema";
import {
  isRecognizedMonitoringResult,
  normalizeHistoryAction,
  normalizeMonitoringCellValue,
  normalizeStatus,
} from "./valueNormalization";

export function parseMonitoringRecords(sheet, validation) {
  const headerMap = buildMonitoringHeaderMap();
  const headerRow = findHeaderRow(sheet, headerMap);
  if (!headerRow) return { recordsByLeakId: new Map(), count: 0 };

  const recordsByLeakId = new Map();
  let count = 0;

  for (
    let rowNumber = headerRow.rowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const raw = {};

    for (const column of headerRow.columns) {
      const cell = row.getCell(column.columnNumber);
      const value =
        column.key === "photo"
          ? getCellPhotoValue(cell)
          : getCellDisplayValue(cell);
      if (
        column.key === "result" &&
        String(value ?? "").trim() &&
        !isRecognizedMonitoringResult(value)
      ) {
        validation?.add(
          sheet.name,
          rowNumber,
          column.header,
          value,
          "Неизвестный результат мониторинга; использовано значение still_leaking",
        );
      }
      const normalized = normalizeMonitoringCellValue(column.key, value);
      if (normalized != null && normalized !== "") raw[column.key] = normalized;
    }

    const leakId = String(raw.leak_id ?? "").trim();
    if (!leakId || !raw.date) {
      validation?.add(
        sheet.name,
        rowNumber,
        !leakId ? "leak_id" : "date",
        !leakId ? raw.leak_id : raw.date,
        "Строка мониторинга пропущена: отсутствует идентификатор утечки или дата",
      );
      continue;
    }

    const monitoringDate = combineDateAndTime(
      parseDateValue(raw.date),
      raw.time,
    );
    if (!monitoringDate) {
      validation?.add(
        sheet.name,
        rowNumber,
        "date",
        raw.date,
        "Строка мониторинга пропущена: некорректная дата",
      );
      continue;
    }

    const roundNumber =
      Number(raw.roundNumber) > 0 ? Number(raw.roundNumber) : 1;
    const record = {
      id: `excel-${leakId}-round-${roundNumber}-${rowNumber}`,
      date: monitoringDate.toISOString(),
      roundId: `excel-round-${roundNumber}`,
      roundNumber,
      monitoredBy: raw.monitoredBy || "",
      result: raw.result || "still_leaking",
      materials_equipment: raw.materials_equipment || "",
      comment: raw.comment || "",
      ...(raw.photo ? { photo: raw.photo } : {}),
    };

    if (!recordsByLeakId.has(leakId)) recordsByLeakId.set(leakId, []);
    recordsByLeakId.get(leakId).push(record);
    count += 1;
  }

  return { recordsByLeakId, count };
}

export function normalizeHistoryCellValue(key, value) {
  if (key === "date") {
    const date = parseDateValue(value);
    return date ? date.toISOString() : String(value ?? "").trim();
  }
  if (key === "time") return formatTime(value);

  if (key === "action") return normalizeHistoryAction(value);
  if (key === "changes") {
    if (Array.isArray(value)) return value;
    const raw = String(value ?? "").trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return String(value ?? "").trim();
}

export function parseHistoryRecords(sheet) {
  const headerMap = buildHistoryHeaderMap();
  const headerRow = findHeaderRow(sheet, headerMap);
  if (!headerRow) return { recordsByLeakId: new Map(), count: 0 };

  const recordsByLeakId = new Map();
  let count = 0;

  for (
    let rowNumber = headerRow.rowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const raw = {};

    for (const column of headerRow.columns) {
      const cell = row.getCell(column.columnNumber);
      const normalized = normalizeHistoryCellValue(
        column.key,
        getCellDisplayValue(cell),
      );
      if (
        normalized != null &&
        normalized !== "" &&
        (!Array.isArray(normalized) || normalized.length > 0)
      ) {
        raw[column.key] = normalized;
      }
    }

    const leakId = String(raw.leak_id ?? "").trim();
    if (!leakId || !raw.date || !raw.action) continue;

    const historyDate = combineDateAndTime(parseDateValue(raw.date), raw.time);
    if (!historyDate) continue;

    const record = {
      action: raw.action,
      date: historyDate.toISOString(),
      ...(raw.user ? { user: raw.user } : {}),
      ...(raw.text ? { text: raw.text } : {}),
      ...(raw.to ? { to: normalizeStatus(raw.to) } : {}),
      ...(Array.isArray(raw.changes) && raw.changes.length
        ? { changes: raw.changes }
        : {}),
    };

    if (!recordsByLeakId.has(leakId)) recordsByLeakId.set(leakId, []);
    recordsByLeakId.get(leakId).push(record);
    count += 1;
  }

  return { recordsByLeakId, count };
}
