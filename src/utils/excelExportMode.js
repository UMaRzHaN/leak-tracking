export const EXCEL_MONITORING_EXPORT_MODE = Object.freeze({
  FULL: "full",
  LATEST_PER_ROUND: "latest_per_round",
});

export function normalizeExcelMonitoringExportMode(value) {
  return value === EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND
    ? value
    : EXCEL_MONITORING_EXPORT_MODE.FULL;
}
