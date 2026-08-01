import { getMonitoringRecords } from "@/utils/monitoring";

const BACKUP_SHEET_NAME = "Project Backup";
const BACKUP_MARKER = "LEAK_TRACKER_EXCEL_BACKUP";
export const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_CHUNK_SIZE = 30_000;
const EXCEL_DATE_TIME_FORMAT = "dd.mm.yyyy hh:mm:ss";
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

  const localized = text.match(
    /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (localized) {
    const [, day, month, year, hour = 0, minute = 0, second = 0] = localized;
    const date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
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

export function addBackupSheet(workbook, archivePayload, lang) {
  if (!archivePayload) return;

  const sheet = workbook.addWorksheet(BACKUP_SHEET_NAME);
  sheet.addRow([
    BACKUP_MARKER,
    BACKUP_SCHEMA_VERSION,
    lang === "ru" ? "Резервная копия проекта" : "Project backup",
  ]);
  sheet.addRow([
    "Chunk",
    "Payload",
    lang === "ru"
      ? "Сводка предназначена для просмотра. Для восстановления используются скрытые служебные столбцы."
      : "The summary is for reference. Restore data is stored in hidden system columns.",
  ]);

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
  const typeLabels =
    lang === "ru"
      ? {
          upstream: "Добыча (Upstream)",
          midstream: "Транспортировка (Midstream)",
          downstream: "Переработка (Downstream)",
        }
      : {
          upstream: "Upstream",
          midstream: "Midstream",
          downstream: "Downstream",
        };
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
  const summaryRows =
    lang === "ru"
      ? [
          ["Проект", archivePayload.project?.name || emptyValue, "@"],
          [
            "Тип проекта",
            typeLabels[archivePayload.project?.type] ||
              archivePayload.project?.type ||
              emptyValue,
            "@",
          ],
          [
            "Экспортировано",
            exportedAt || emptyValue,
            exportedAt ? EXCEL_DATE_TIME_FORMAT : "@",
          ],
          ["Утечек", leaks.length, INTEGER_FORMAT],
          ["Проверок мониторинга", monitoringCount, INTEGER_FORMAT],
          ["Записей истории", historyCount, INTEGER_FORMAT],
          [
            "Текущий обход",
            round?.number ? Number(round.number) : emptyValue,
            round?.number ? '"№ "0' : "@",
          ],
          [
            "Проверено в текущем обходе",
            currentRoundChecked ?? emptyValue,
            currentRoundChecked == null ? "@" : INTEGER_FORMAT,
          ],
          [
            "Всего в текущем обходе",
            currentRoundTotal ?? emptyValue,
            currentRoundTotal == null ? "@" : INTEGER_FORMAT,
          ],
          [
            "Осталось проверить",
            currentRoundRemaining ?? emptyValue,
            currentRoundRemaining == null ? "@" : INTEGER_FORMAT,
          ],
          ["Версия резервной копии", BACKUP_SCHEMA_VERSION, INTEGER_FORMAT],
        ]
      : [
          ["Project", archivePayload.project?.name || emptyValue, "@"],
          [
            "Project type",
            typeLabels[archivePayload.project?.type] ||
              archivePayload.project?.type ||
              emptyValue,
            "@",
          ],
          [
            "Exported at",
            exportedAt || emptyValue,
            exportedAt ? EXCEL_DATE_TIME_FORMAT : "@",
          ],
          ["Leaks", leaks.length, INTEGER_FORMAT],
          ["Monitoring checks", monitoringCount, INTEGER_FORMAT],
          ["History records", historyCount, INTEGER_FORMAT],
          [
            "Current round",
            round?.number ? Number(round.number) : emptyValue,
            round?.number ? '"No. "0' : "@",
          ],
          [
            "Checked in current round",
            currentRoundChecked ?? emptyValue,
            currentRoundChecked == null ? "@" : INTEGER_FORMAT,
          ],
          [
            "Total in current round",
            currentRoundTotal ?? emptyValue,
            currentRoundTotal == null ? "@" : INTEGER_FORMAT,
          ],
          [
            "Remaining to check",
            currentRoundRemaining ?? emptyValue,
            currentRoundRemaining == null ? "@" : INTEGER_FORMAT,
          ],
          ["Backup schema", BACKUP_SCHEMA_VERSION, INTEGER_FORMAT],
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

  sheet.getRow(summaryHeaderRow).getCell(3).value =
    lang === "ru" ? "Параметр" : "Field";
  sheet.getRow(summaryHeaderRow).getCell(4).value =
    lang === "ru" ? "Значение" : "Value";

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
