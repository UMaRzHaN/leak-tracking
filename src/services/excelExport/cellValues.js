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

const DATE_KEYS = new Set(["date", "repairAt", "resolvedAt"]);
const TIME_KEYS = new Set(["time"]);
const INTEGER_KEYS = new Set(["index", "roundNumber", "Operating_mode"]);
const PERCENT_KEYS = new Set([
  "flareShare",
  "utilShare",
  "gasPercentage",
  "uncertainty",
]);
const WHOLE_PERCENT_KEYS = new Set(["gasPercentage", "uncertainty"]);
const COORDINATE_KEYS = new Set(["lat", "lng"]);
const DECIMAL_KEYS = new Set([
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

  // Comma and hyphen belong here next to dot and slash. Without them a date
  // like `09,10,2026` fell through to `new Date(text)`, and V8 reads that as
  // the American month-day-year: 9 October came back as 10 September. The
  // fallback also builds in local time, so at UTC+5 the result landed on the
  // previous day once ExcelJS converted it to a serial number. Matching here
  // keeps both bugs out — this branch is day-first, which is how the app
  // stores dates, and it builds through Date.UTC.
  const localized = text.match(
    /^(\d{1,2})[./,-](\d{1,2})[./,-](\d{4})(?:[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
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

export function toExcelTimeValue(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return (
      (value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds()) /
      86_400
    );
  }

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
