import {
  applyColumnFormats,
  parseTimestamp,
  toExcelCellValue,
} from "./cellValues";
import { getRepairLogExportRows } from "./repairLogRows";
import {
  addStructuredTable,
  getColumnWidth,
  styleBodyRows,
  styleHeaderRow,
  writePhotoLinks,
} from "./sheetLayout";

/**
 * «Журнал ремонтов»: начала, отметки стадий с бригадой и замечанием,
 * приёмки и возвраты в «ожидает МТР» — строкой на событие, по времени.
 */
export async function buildRepairLogSheet(
  workbook,
  orderedLeaks,
  texts,
  mode,
  photoMap = {},
) {
  const rows = getRepairLogExportRows(orderedLeaks, mode).map((row) => ({
    ...row,
    date: parseTimestamp(row.dateRaw) ?? "",
    time: parseTimestamp(row.dateRaw) ?? "",
    event: texts.repairLog.events[row.event] ?? row.event,
    // Ответы проверки ремонта — теми же словами, что у осмотра в листе
    // обходов; у проверки без вопроса клетка пустая.
    physicalTag: formatFlag(row.physicalTag, texts),
    fiction: formatFlag(row.fiction, texts),
  }));
  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(texts.sheets.repairLog);
  const keys = [
    "index",
    "leak_id",
    "roundNumber",
    "date",
    "time",
    "event",
    "brigade",
    "materials_equipment",
    "note",
    "physicalTag",
    "fiction",
    "user",
    "previousPhoto",
    "photo",
  ];
  const photoColumns = [
    ["previousPhoto", "previousPhotoMapKey"],
    ["photo", "photoMapKey"],
  ];
  const isPhoto = (key) => key === "previousPhoto" || key === "photo";
  const headers = keys.map((key) => texts.repairLog.headers[key]);

  addStructuredTable(sheet, {
    name: "RepairLog",
    headers,
    // Ячейки снимков заполняет проход ниже: ссылка — свойство ячейки.
    rows: rows.map((row) =>
      keys.map((key) => (isPhoto(key) ? "" : toExcelCellValue(key, row[key]))),
    ),
    theme: "TableStyleMedium3",
  });
  styleHeaderRow(sheet, "FFC55A11");
  await styleBodyRows(sheet, rows.length);
  await writePhotoLinks(sheet, rows, keys, photoColumns, photoMap, texts);
  applyColumnFormats(sheet, keys);

  keys.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
      { isPhoto: isPhoto(key) },
    );
  });
}

function formatFlag(value, texts) {
  if (typeof value !== "boolean") return "";
  return value ? texts.monitoring.flags.yes : texts.monitoring.flags.no;
}
