import { isValidPortablePhotoPath } from "@/repositories/backupSchema";
import { priorityFromSpeed } from "@/utils/priority";
import {
  combineDateAndTime,
  formatDate,
  formatMomentDate,
  formatTime,
  parseDateValue,
} from "./cellDates";
import { normalizeHeader } from "./workbookSchema";
import { isValidLatitude, isValidLongitude } from "@/utils/coordinates";

const NUMERIC_KEYS = new Set([
  "index",
  "id",
  "createdAt",
  "updatedAt",
  "pressure",
  "temperature",
  "temperature_K",
  "uncertainty",
  "gasPercentage",
  "leak_speed",
  "leak_speed_kg_m",
  "leak_speed_kg_h",
  "flareShare",
  "utilShare",
  "Operating_mode",
  "weightedGWP",
  "Total_Annual_Methane_Loss_m3_y",
  "Total_Annual_Methane_Loss_kg_y",
  "Total_Annual_Methane_Loss_t_y",
  "Emissions_t_CO2eq_year",
  "Emissions_kg_CO2_eq_year",
  "GWP",
  "GWP_Minus",
  "lat",
  "lng",
  "coords_accuracy",
]);

const WHOLE_PERCENT_KEYS = new Set(["gasPercentage", "uncertainty"]);
const DATE_KEYS = new Set(["date", "repairAt", "resolvedAt"]);
const DATE_TIME_KEYS = new Set(["createdAt", "updatedAt"]);
const PHOTO_KEYS = new Set(["photo", "photo_repair", "photo_after"]);

export function isPhotoCellKey(key) {
  return PHOTO_KEYS.has(key);
}

const STATUS_BY_VALUE = new Map(
  /** @type {[string, string][]} */ ([
    ...["open", "открыта", "открыто", "активна", "новая"].map((value) => [
      value,
      "open",
    ]),
    ...[
      "in progress",
      "in_progress",
      // Подпись, которую пишет сама выгрузка на английском
      // (`leakDetails.statuses.in_progress`). Её тут не было, и статус после
      // круга через Excel становился `open` — см. тест на круг подписей.
      "under repair",
      "в ремонте",
      "ремонт",
      "на ремонте",
    ].map((value) => [value, "in_progress"]),
    ...["resolved", "устранена", "устранено", "закрыта", "закрыто"].map(
      (value) => [value, "resolved"],
    ),
  ]),
);

const MONITORING_RESULT_BY_VALUE = new Map(
  /** @type {[string, string][]} */ ([
    ...[
      "still leaking",
      "still_leaking",
      "leak present",
      "yes — leak present",
      // `excelExport.monitoring.answers.still_leaking` на английском — просто
      // «Yes». Совпадало с нужным значением только потому, что запасной
      // вариант `normalizeMonitoringResult` и есть `still_leaking`.
      "yes",
      "да",
      "да — утечка есть",
      "утечка есть",
      "утечка сохраняется",
      "сохраняется",
      "open",
    ].map((value) => [value, "still_leaking"]),
    ...[
      "needs recheck",
      "needs_recheck",
      "leak under repair",
      "under repair",
      "under repair — needs recheck",
      "утечка в ремонте",
      "в ремонте — требуется повторная проверка",
      "в ремонте",
    ].map((value) => [value, "needs_recheck"]),
    ...[
      "resolved",
      "no leak",
      "no — no leak",
      // `excelExport.monitoring.answers.resolved` на английском — просто «No».
      // Худший из трёх промахов: обход «утечки нет» возвращался как «утечка
      // есть».
      "no",
      "нет",
      "нет — утечки нет",
      "утечки нет",
      "утечка устранена",
      "устранена",
      "устранено",
    ].map((value) => [value, "resolved"]),
  ]),
);

const HISTORY_ACTION_BY_VALUE = new Map(
  /** @type {[string, string][]} */ ([
    ...["created", "запись создана", "создано", "создана"].map((value) => [
      value,
      "created",
    ]),
    ...["edited", "data updated", "данные изменены", "изменено"].map(
      (value) => [value, "edited"],
    ),
    ...[
      "status_changed",
      "status changed",
      "статус изменен",
      "статус изменён",
    ].map((value) => [value, "status_changed"]),
    ...["comment", "комментарий"].map((value) => [value, "comment"]),
    ...["monitoring", "мониторинг"].map((value) => [value, "monitoring"]),
  ]),
);

export function parseNumberValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isRecognizedStatus(value) {
  const text = normalizeHeader(value);
  return !text || STATUS_BY_VALUE.has(text);
}

export function isRecognizedMonitoringResult(value) {
  const text = normalizeHeader(value);
  return !text || MONITORING_RESULT_BY_VALUE.has(text);
}

export function normalizeStatus(value) {
  return STATUS_BY_VALUE.get(normalizeHeader(value)) ?? "open";
}

export function normalizeMonitoringResult(value) {
  return (
    MONITORING_RESULT_BY_VALUE.get(normalizeHeader(value)) ?? "still_leaking"
  );
}

export function normalizeHistoryAction(value) {
  const normalized = HISTORY_ACTION_BY_VALUE.get(normalizeHeader(value));
  return normalized ?? "edited";
}

export function isValidPhotoPath(value) {
  return isValidPortablePhotoPath(
    value.startsWith("photos/") ? `zip:${value}` : value,
  );
}

export function normalizeCellValue(
  key,
  value,
  { percentFormatted = false } = {},
) {
  if (key === "status") {
    const text = String(value ?? "").trim();
    if (!text) return "";
    // Неузнанный статус — это «прочитать не удалось», а не «человек поставил
    // open». Подставленное значение доезжало до `mergeSheetEditsIntoBackup`
    // неотличимым от осознанной правки и переписывало верный статус из слепка
    // проекта. Пустая строка сюда не попадает в `raw`, и слепок остаётся —
    // ровно так же здесь поступают с негодным путём к фотографии и с
    // координатой вне диапазона.
    //
    // Путь без слепка не меняется: `normalizeImportedLeak` всё равно зовёт
    // `normalizeStatus`, и утечка из чужой книги по-прежнему получает `open`.
    if (!isRecognizedStatus(text)) return "";
    return normalizeStatus(text);
  }
  if (NUMERIC_KEYS.has(key)) {
    const numeric = parseNumberValue(value);
    // Координата вне диапазона не импортируется — так и написано в
    // предупреждении, которое выдаёт разбор. Отсеивается здесь, а не после,
    // чтобы негодное значение вовсе не попало в строку: слияние берёт из неё
    // правки, и координата, отброшенная позже, успела бы сойти за правку.
    if (key === "lat" && numeric != null && !isValidLatitude(numeric)) {
      return null;
    }
    if (key === "lng" && numeric != null && !isValidLongitude(numeric)) {
      return null;
    }
    return numeric != null && percentFormatted && WHOLE_PERCENT_KEYS.has(key)
      ? numeric * 100
      : numeric;
  }
  if (DATE_KEYS.has(key)) {
    const date = parseDateValue(value, { calendarOnly: true });
    return date ? formatDate(date) : "";
  }
  if (DATE_TIME_KEYS.has(key)) {
    const date = parseDateValue(value);
    return date ? date.getTime() : parseNumberValue(value);
  }
  if (key === "time") return formatTime(value);
  if (isPhotoCellKey(key)) {
    const text = String(value ?? "").trim();
    if (text.startsWith("photos/")) return `zip:${text}`;
    return isValidPhotoPath(text) ? text : "";
  }
  return String(value ?? "").trim();
}

function rowHasImportableData(row) {
  return [
    "leak_id",
    "date",
    "object",
    "component",
    "location",
    "leak_speed",
    "lat",
    "lng",
  ].some((key) => row[key] != null && row[key] !== "");
}

export function normalizeImportedLeak(row, rowNumber, sequence) {
  if (!rowHasImportableData(row)) return null;

  const now = Date.now();
  const parsedDate = parseDateValue(row.date);
  const parsedDateTime = combineDateAndTime(parsedDate, row.time);
  const persistedRow = { ...row };
  delete persistedRow.time;
  if (persistedRow.lat != null && !isValidLatitude(persistedRow.lat)) {
    delete persistedRow.lat;
  }
  if (persistedRow.lng != null && !isValidLongitude(persistedRow.lng)) {
    delete persistedRow.lng;
  }
  const createdAt =
    row.createdAt ?? parsedDateTime?.getTime() ?? now + rowNumber + sequence;
  const updatedAt =
    row.updatedAt ?? row.resolvedAt ?? row.repairAt ?? createdAt;
  const leakSpeed = parseNumberValue(row.leak_speed);
  const leakId = String(row.leak_id || row.index || `IMP-${rowNumber}`).trim();
  return {
    ...persistedRow,
    id: row.id ?? createdAt + sequence,
    created_at: String(row.created_at || createdAt),
    createdAt,
    updatedAt,
    index: row.index ?? sequence,
    // Момент, а не календарный день: `createdAt` — отметка времени, и днём
    // записи считается тот, что стоял на часах у заводившего.
    date: row.date || formatMomentDate(new Date(createdAt)),
    status: normalizeStatus(row.status),
    leak_id: leakId,
    leak_speed: leakSpeed,
    priority: row.priority || priorityFromSpeed(leakSpeed),
    history: [
      {
        action: "created",
        date: new Date(createdAt).toISOString(),
        user: row.detectedBy || "Excel import",
      },
    ],
  };
}

export function normalizeMonitoringCellValue(key, value) {
  if (key === "roundNumber" || key === "index") return parseNumberValue(value);
  if (key === "date") {
    const date = parseDateValue(value);
    return date ? date.toISOString() : "";
  }
  if (key === "time") return formatTime(value);
  if (key === "result") return normalizeMonitoringResult(value);
  if (key === "photo" || key === "previousPhoto") {
    const text = String(value ?? "").trim();
    if (text.startsWith("photos/")) return `zip:${text}`;
    return isValidPhotoPath(text) ? text : "";
  }
  return String(value ?? "").trim();
}
