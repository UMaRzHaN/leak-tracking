import { LEAK_FIELD_VERSIONS_KEY } from "@/services/storage/leakFieldVersions";
import { PHOTO_KEYS } from "./constants";
import { parseTime } from "./projectMeta";

export const MERGE_IGNORED_FIELD_KEYS = new Set([
  "id",
  "index",
  "created_at",
  "createdAt",
  "updatedAt",
  "importedAt",
  "importedFromExcel",
  "time",
  LEAK_FIELD_VERSIONS_KEY,
]);

export const MERGE_ARRAY_FIELD_KEYS = new Set(["history", "monitoringRecords"]);
export const EXCEL_DERIVED_FIELD_KEYS = new Set([
  "temperature_K",
  "leak_speed_kg_m",
  "leak_speed_kg_h",
  "flareShare",
  "utilShare",
  "weightedGWP",
  "Total_Annual_Methane_Loss_m3_y",
  "Total_Annual_Methane_Loss_kg_y",
  "Total_Annual_Methane_Loss_t_y",
  "Emissions_t_CO2eq_year",
  "Emissions_kg_CO2_eq_year",
  "priority",
  "repairAt",
]);
const EXCEL_DATE_FIELD_KEYS = new Set(["date", "resolvedAt"]);

export function isEmptyMergeValue(value) {
  return (
    value == null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function comparableMergeValue(value) {
  if (isEmptyMergeValue(value)) return "";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  }
  return String(value).trim();
}

export function comparableExcelDate(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;
  }
  if (typeof value === "number" && value > 100000000000) {
    return comparableExcelDate(new Date(value));
  }

  const text = String(value).trim();
  const dotted = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dotted) {
    const year = dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3];
    return `${year}-${Number(dotted[2])}-${Number(dotted[1])}`;
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? comparableExcelDate(parsed) : text;
}

export function mergeFieldValuesEqual(key, left, right, options = {}) {
  if (options.source === "excel" && EXCEL_DATE_FIELD_KEYS.has(key)) {
    return comparableExcelDate(left) === comparableExcelDate(right);
  }
  return comparableMergeValue(left) === comparableMergeValue(right);
}

function serializeMergeHistoryValue(value) {
  if (isEmptyMergeValue(value)) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === "string") {
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  }
  return "[changed]";
}

export function buildMergeHistoryChanges(
  existingLeak,
  mergedLeak,
  options = {},
) {
  const keys = new Set([
    ...Object.keys(existingLeak ?? {}),
    ...Object.keys(mergedLeak ?? {}),
  ]);

  return [...keys]
    .filter(
      (key) =>
        !MERGE_IGNORED_FIELD_KEYS.has(key) &&
        !MERGE_ARRAY_FIELD_KEYS.has(key) &&
        !(options.source === "excel" && EXCEL_DERIVED_FIELD_KEYS.has(key)) &&
        !mergeFieldValuesEqual(
          key,
          existingLeak?.[key],
          mergedLeak?.[key],
          options,
        ),
    )
    .map((key) => {
      if (PHOTO_KEYS.includes(key)) {
        return {
          key,
          kind: "photo",
          from: Boolean(existingLeak?.[key]),
          to: Boolean(mergedLeak?.[key]),
        };
      }

      return {
        key,
        from: serializeMergeHistoryValue(existingLeak?.[key]),
        to: serializeMergeHistoryValue(mergedLeak?.[key]),
      };
    });
}

export const sameMonitoringRound = (left, right) =>
  (Number(left?.roundNumber) || 1) === (Number(right?.roundNumber) || 1);

/**
 * Индекс записи о том же событии мониторинга: тот же обход, та же метка
 * времени до миллисекунды. Отвечает `-1`, если времени нет.
 */
export function findByRoundAndTime(records, record) {
  const time = parseTime(record?.date);
  if (!(time > 0)) return -1;
  return records.findIndex(
    (current) =>
      sameMonitoringRound(current, record) && parseTime(current?.date) === time,
  );
}
