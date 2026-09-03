import { matchHumanDate } from "@/utils/humanDate";
// The dots are escaped on purpose. In an Excel format code an unescaped `.`
// is the decimal-separator placeholder, not a literal, so Excel renders it
// with the separator of the viewer's locale: a Russian Excel turned
// `dd.mm.yyyy` into `09,08,2026`. Worse than the look, a code that reads as a
// number stops the column being treated as dates at all, so the autofilter
// offered number filters instead of the year/month/day tree. `\.` is a
// literal dot in every locale.
const EXCEL_DATE_FORMAT = "dd\\.mm\\.yyyy";
const EXCEL_TIME_FORMAT = "hh:mm:ss";
const INTEGER_FORMAT = "#,##0";
const DECIMAL_FORMAT = "#,##0.00";
const COORDINATE_FORMAT = "0.000000";
const PERCENT_FORMAT = "0.0%";

const DATE_KEYS = new Set([
  "date",
  "repairAt",
  "resolvedAt",
  "installed_at",
  "inspected_at",
]);
// `repairTime` и `resolvedTime` держат тот же момент, что и колонки-даты рядом:
// формат даты в книге показывает только день, а лист ремонтов читают вместе с
// часами — иначе починка «за 0,5 часа» выглядит начатой и законченной в один
// день без всякого объяснения.
const TIME_KEYS = new Set(["time", "repairTime", "resolvedTime"]);
const INTEGER_KEYS = new Set([
  "index",
  "roundNumber",
  "attempt",
  "coords_accuracy",
  "Operating_mode",
]);
const PERCENT_KEYS = new Set([
  "flareShare",
  "utilShare",
  "gasPercentage",
  "uncertainty",
]);
const WHOLE_PERCENT_KEYS = new Set(["gasPercentage", "uncertainty"]);
const COORDINATE_KEYS = new Set(["lat", "lng"]);
const DECIMAL_KEYS = new Set([
  "durationHours",
  "pressure",
  "temperature",
  "temperature_K",
  "uncertainty",
  "gasPercentage",
  "leak_speed",
  "leak_speed_kg_h",
  "weightedGWP",
  "Total_Annual_Methane_Loss_m3_y",
  "Total_Annual_Methane_Loss_t_y",
  "Emissions_t_CO2eq_year",
  "Emissions_kg_CO2_eq_year",
]);
const TEXT_IDENTIFIER_KEYS = new Set(["video_id", "serial_number"]);

export function normalizeExcelCellValue(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : "";
  }

  return value ?? "";
}

export function parseTimestamp(value) {
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

export function toExcelTimeValue(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return (
      (value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds()) /
      86_400
    );
  }

  // Диапазон здесь не проверяется, а при чтении книги — проверяется:
  // `parseTimeValue` отвергает часы больше 23 и минуты больше 59, здесь же
  // «99:99» превратится в долю больше суток и уедет в книгу таким.
  //
  // Вреда показать не удалось: в хранилище время кладёт `formatTime`, а он уже
  // прошёл ту проверку, так что негодному значению сюда взяться неоткуда.
  // Оставлено как есть, чтобы не выдавать уборку за находку, но помечено:
  // расхождение настоящее, и держится оно только на том, что писатель у этого
  // поля один.
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return normalizeExcelCellValue(value);
  const [, hours, minutes, seconds = 0] = match;
  return (
    (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) / 86_400
  );
}

export function getExcelColumnFormat(key) {
  if (DATE_KEYS.has(key)) return EXCEL_DATE_FORMAT;
  if (TIME_KEYS.has(key)) return EXCEL_TIME_FORMAT;
  if (key === "leak_id") return "General";
  if (INTEGER_KEYS.has(key)) return INTEGER_FORMAT;
  if (PERCENT_KEYS.has(key)) return PERCENT_FORMAT;
  if (COORDINATE_KEYS.has(key)) return COORDINATE_FORMAT;
  if (DECIMAL_KEYS.has(key)) return DECIMAL_FORMAT;
  return "@";
}

export function toExcelCellValue(key, value) {
  if (value == null || value === "") return "";
  if (DATE_KEYS.has(key)) {
    return parseTimestamp(value) ?? normalizeExcelCellValue(value);
  }
  if (TIME_KEYS.has(key)) return toExcelTimeValue(value);
  if (
    INTEGER_KEYS.has(key) ||
    PERCENT_KEYS.has(key) ||
    COORDINATE_KEYS.has(key) ||
    DECIMAL_KEYS.has(key)
  ) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return normalizeExcelCellValue(value);
    return WHOLE_PERCENT_KEYS.has(key) ? numeric / 100 : numeric;
  }
  if (TEXT_IDENTIFIER_KEYS.has(key)) return String(value);
  if (key === "leak_id") {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : "";
    }
    const text = String(value).trim();
    if (
      /^(?:0|[1-9]\d*)$/.test(text) &&
      text.length <= 15 &&
      Number.isSafeInteger(Number(text))
    ) {
      return Number(text);
    }
    return text;
  }
  return normalizeExcelCellValue(value);
}

export function applyColumnFormats(sheet, keys) {
  keys.forEach((key, index) => {
    sheet.getColumn(index + 1).numFmt = getExcelColumnFormat(key);
  });
}

export function formatLeakTime(leak, row) {
  if (row?.time != null && String(row.time).trim() !== "") {
    return String(row.time).trim();
  }

  const date = [
    leak?.createdAt,
    leak?.created_at,
    row?.createdAt,
    row?.created_at,
    leak?.date,
    row?.date,
  ]
    .map(parseTimestamp)
    .find(Boolean);
  if (!date) return "";

  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
