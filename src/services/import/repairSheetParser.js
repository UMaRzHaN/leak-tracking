import { combineDateAndTime, formatTime, parseDateValue } from "./cellDates";
import {
  buildRepairHeaderMap,
  findHeaderRow,
  getCellDisplayValue,
  getCellPhotoValue,
} from "./workbookSchema";
import { isValidPhotoPath } from "./valueNormalization";
import { normalizeLeakTag } from "@/utils/leakIdentity";

function normalizeRepairCellValue(key, value) {
  if (key === "repairAt" || key === "resolvedAt") {
    return parseDateValue(value, { calendarOnly: true });
  }
  if (key === "repairTime" || key === "resolvedTime") return formatTime(value);
  if (key === "repairPhoto" || key === "donePhoto") {
    const text = String(value ?? "").trim();
    if (text.startsWith("photos/")) return `zip:${text}`;
    return isValidPhotoPath(text) ? text : "";
  }
  return String(value ?? "").trim();
}

/** Номер события: бирка, вид и момент — как при переносе со старых полей. */
function repairEventId(leakId, type, date) {
  return `${String(leakId)}:${type}:${date}`;
}

function repairEvent(leakId, type, date, fields) {
  const event = { id: repairEventId(leakId, type, date), type, date };
  for (const [key, value] of Object.entries(fields)) {
    if (value) event[key] = value;
  }
  return event;
}

/**
 * Починки с листа ремонтов: на строку-попытку до двух событий ленты.
 *
 * Лист ремонтов — единственное место в книге, где починки записаны все: в
 * колонках листа утечек их только одна, последняя. Пока лист не читали, книга
 * без служебного слепка теряла историю починок целиком.
 *
 * Начало и завершение — разные события, и у каждого свой снимок. Попытка без
 * даты начала пропускается: событие без момента в ленту не встаёт.
 */
export function parseRepairRecords(sheet) {
  const headerMap = buildRepairHeaderMap();
  const headerRow = findHeaderRow(sheet, headerMap);
  if (!headerRow) return { eventsByLeakId: new Map(), count: 0 };

  const eventsByLeakId = new Map();
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
        column.key === "repairPhoto" || column.key === "donePhoto"
          ? getCellPhotoValue(cell)
          : getCellDisplayValue(cell);
      const normalized = normalizeRepairCellValue(column.key, value);
      if (normalized != null && normalized !== "") raw[column.key] = normalized;
    }

    const leakId = String(raw.leak_id ?? "").trim();
    const leakKey = normalizeLeakTag(leakId);
    const startedAt = combineDateAndTime(raw.repairAt, raw.repairTime);
    if (!leakKey || !startedAt) continue;

    const events = [
      repairEvent(leakId, "repair_started", startedAt.toISOString(), {
        user: raw.user,
        photo: raw.repairPhoto,
      }),
    ];
    const doneAt = combineDateAndTime(raw.resolvedAt, raw.resolvedTime);
    if (doneAt) {
      events.push(
        repairEvent(leakId, "repair_done", doneAt.toISOString(), {
          user: raw.user,
          photo: raw.donePhoto,
          materials_equipment: raw.materials_equipment,
          note: raw.note,
        }),
      );
    }

    if (!eventsByLeakId.has(leakKey)) eventsByLeakId.set(leakKey, []);
    eventsByLeakId.get(leakKey).push(...events);
    count += events.length;
  }

  return { eventsByLeakId, count };
}
