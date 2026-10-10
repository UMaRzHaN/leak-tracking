export const EXCEL_MONITORING_EXPORT_MODE = Object.freeze({
  FULL: "full",
  LATEST_PER_ROUND: "latest_per_round",
});

export function normalizeExcelMonitoringExportMode(value) {
  return value === EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND
    ? value
    : EXCEL_MONITORING_EXPORT_MODE.FULL;
}

/**
 * «Последняя в обходе»: из записей, помеченных номером обхода, на каждую
 * сущность в каждом обходе остаётся одна — самая поздняя. Записи без номера
 * (сделанные до того, как номер стали писать) остаются все. Порядок прежний.
 *
 * @template T
 * @param {T[]} items
 * @param {{ keyOf: (item: T) => unknown, roundOf: (item: T) => unknown, timeOf: (item: T) => number }} by
 * @returns {T[]}
 */
export function keepLatestPerRound(items, { keyOf, roundOf, timeOf }) {
  const latest = new Map();
  for (const item of items) {
    const round = roundOf(item);
    if (round == null) continue;
    const group = `${String(keyOf(item))}\u0000${String(round)}`;
    const current = latest.get(group);
    if (!current || timeOf(item) >= timeOf(current)) latest.set(group, item);
  }
  return items.filter((item) => {
    const round = roundOf(item);
    if (round == null) return true;
    return latest.get(`${String(keyOf(item))}\u0000${String(round)}`) === item;
  });
}
