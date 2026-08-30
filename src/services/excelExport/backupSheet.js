import { getMonitoringRecords } from "@/utils/monitoring";
import { matchHumanDate } from "@/utils/humanDate";

const BACKUP_SHEET_NAME = "Project Backup";
const BACKUP_MARKER = "LEAK_TRACKER_EXCEL_BACKUP";
export const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_CHUNK_SIZE = 30_000;
// Dots escaped for the same reason as in cellValues.js: unescaped they are
// the locale's decimal separator, not literal dots. The colons need no
// escaping — they are literal in a time code.
const EXCEL_DATE_TIME_FORMAT = "dd\\.mm\\.yyyy hh:mm:ss";
const INTEGER_FORMAT = "#,##0";

function parseTimestamp(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  // Собирается через `Date.UTC`, а не в местном времени: ExcelJS переводит дату
  // в серийный номер, и построенная на UTC+5 полночь съезжала на день назад.
  const human = matchHumanDate(text);
  if (human) {
    const date = new Date(
      Date.UTC(
        human.year,
        human.month - 1,
        human.day,
        human.hours,
        human.minutes,
        human.seconds,
      ),
    );
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const numeric = Number(text);
  const date = new Date(Number.isFinite(numeric) ? numeric : text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function styleHeaderRow(sheet, fillColor) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: fillColor },
  };
  headerRow.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  headerRow.height = 34;
}

export function addBackupSheet(workbook, archivePayload, texts) {
  if (!archivePayload) return;

  const sheet = workbook.addWorksheet(BACKUP_SHEET_NAME);
  sheet.addRow([BACKUP_MARKER, BACKUP_SCHEMA_VERSION, texts.backup.title]);
  sheet.addRow(["Chunk", "Payload", texts.backup.note]);

  const serialized = JSON.stringify(archivePayload);
  let chunkCount = 0;
  for (let offset = 0, index = 1; offset < serialized.length; index += 1) {
    sheet.addRow([index, serialized.slice(offset, offset + BACKUP_CHUNK_SIZE)]);
    offset += BACKUP_CHUNK_SIZE;
    chunkCount += 1;
  }

  const leaks = Array.isArray(archivePayload.leaks) ? archivePayload.leaks : [];
  const monitoringCount = leaks.reduce(
    (total, leak) =>
      total +
      (Array.isArray(leak?.monitoringRecords)
        ? leak.monitoringRecords.length
        : 0),
    0,
  );
  const historyCount = leaks.reduce(
    (total, leak) =>
      total + (Array.isArray(leak?.history) ? leak.history.length : 0),
    0,
  );
  const typeLabels = texts.backup.projectTypes;
  const exportedAt = parseTimestamp(archivePayload.exportedAt);
  const round = archivePayload.monitoringRound;
  const currentRoundCheckedFromRecords = round
    ? leaks.filter((leak) =>
        getMonitoringRecords(leak).some((record) =>
          record.roundId
            ? record.roundId === round.id
            : Number(record.roundNumber) === Number(round.number),
        ),
      ).length
    : null;
  const summaryTotal = Number(round?.summary?.total);
  const summaryChecked = Number(round?.summary?.checked);
  const currentRoundTotal = round
    ? Number.isFinite(summaryTotal)
      ? summaryTotal
      : leaks.length
    : null;
  const currentRoundChecked = round
    ? Number.isFinite(summaryChecked)
      ? summaryChecked
      : currentRoundCheckedFromRecords
    : null;
  const currentRoundRemaining = round
    ? Math.max(0, currentRoundTotal - currentRoundChecked)
    : null;
  const emptyValue = "—";
  const summary = texts.backup.summary;
  const summaryRows = [
    [summary.project, archivePayload.project?.name || emptyValue, "@"],
    [
      summary.projectType,
      typeLabels[archivePayload.project?.type] ||
        archivePayload.project?.type ||
        emptyValue,
      "@",
    ],
    [
      summary.exportedAt,
      exportedAt || emptyValue,
      exportedAt ? EXCEL_DATE_TIME_FORMAT : "@",
    ],
    [summary.leaks, leaks.length, INTEGER_FORMAT],
    [summary.monitoringChecks, monitoringCount, INTEGER_FORMAT],
    [summary.historyRecords, historyCount, INTEGER_FORMAT],
    [
      summary.currentRound,
      round?.number ? Number(round.number) : emptyValue,
      round?.number ? texts.backup.roundNumberFormat : "@",
    ],
    [
      summary.checkedInRound,
      currentRoundChecked ?? emptyValue,
      currentRoundChecked == null ? "@" : INTEGER_FORMAT,
    ],
    [
      summary.totalInRound,
      currentRoundTotal ?? emptyValue,
      currentRoundTotal == null ? "@" : INTEGER_FORMAT,
    ],
    [
      summary.remainingInRound,
      currentRoundRemaining ?? emptyValue,
      currentRoundRemaining == null ? "@" : INTEGER_FORMAT,
    ],
    [summary.schemaVersion, BACKUP_SCHEMA_VERSION, INTEGER_FORMAT],
  ];

  const summaryHeaderRow = 4;
  const requiredRows = summaryHeaderRow + summaryRows.length;
  for (
    let rowNumber = 2 + chunkCount;
    rowNumber < requiredRows;
    rowNumber += 1
  ) {
    sheet.addRow([]);
  }

  sheet.getRow(summaryHeaderRow).getCell(3).value = texts.backup.fieldColumn;
  sheet.getRow(summaryHeaderRow).getCell(4).value = texts.backup.valueColumn;

  summaryRows.forEach(([label, value, numberFormat], index) => {
    const row = sheet.getRow(summaryHeaderRow + index + 1);
    row.getCell(3).value = label;
    row.getCell(4).value = value;
    row.getCell(3).numFmt = "@";
    row.getCell(4).numFmt = numberFormat;
    row.getCell(3).font = { bold: true, color: { argb: "FF3F3F3F" } };
    if (index % 2 === 0) {
      row.getCell(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3EDF8" },
      };
      row.getCell(4).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3EDF8" },
      };
    }
  });

  const summaryHeader = sheet.getRow(summaryHeaderRow);
  summaryHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  summaryHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF8064A2" },
  };
  summaryHeader.alignment = { vertical: "middle", horizontal: "center" };
  summaryHeader.height = 26;

  sheet.views = [{ state: "frozen", ySplit: summaryHeaderRow }];
  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 100;
  sheet.getColumn(1).hidden = true;
  sheet.getColumn(2).hidden = true;
  sheet.getColumn(3).width = 30;
  sheet.getColumn(4).width = 52;
  sheet.getRow(2).height = 34;
  sheet.getRow(2).alignment = { vertical: "middle", wrapText: true };
  styleHeaderRow(sheet, "FF7030A0");
}
