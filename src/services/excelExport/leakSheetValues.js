import { buildLeakCalculationParams } from "@/utils/calculationParams";
import { formatLeakTime } from "./cellValues";

/**
 * Колонки листа утечек, которые выгрузка считает, а не переносит из записи.
 *
 * Держатся в одном месте с чтением обратно: импорт отличает правку человека
 * от пересчёта, сравнивая ячейку с тем, что выгрузка показала бы для записи.
 * Пока одна сторона округляла, а другая сравнивала с сырым полем, нетронутая
 * книга «правила» почти каждую утечку — и дописывала в неё округлённые
 * величины расчёта.
 */
const ROUNDED_KEYS = new Set([
  "Total_Annual_Methane_Loss_m3_y",
  "Emissions_t_CO2eq_year",
]);

export function roundSheetNumber(value) {
  return value != null && Number.isFinite(Number(value))
    ? Math.round(Number(value) * 100) / 100
    : value;
}

/**
 * Значение, которое выгрузка покажет в колонке `key` для записи.
 *
 * @param {string} key
 * @param {Record<string, any>} leak
 * @param {Record<string, any>|null} [projectVars]
 */
export function getLeakSheetValue(key, leak, projectVars) {
  if (ROUNDED_KEYS.has(key)) return roundSheetNumber(leak?.[key]);
  // Содержание газа берётся из переменных проекта, если у записи своего нет.
  if (key === "gasPercentage") {
    return buildLeakCalculationParams(leak, projectVars ?? {}).gasPercentage;
  }
  if (key === "time") return formatLeakTime(leak, leak);
  return leak?.[key];
}
