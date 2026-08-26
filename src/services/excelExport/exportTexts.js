import { fromEntries } from "@/utils/fromEntries";
const HISTORY_KEYS = [
  "index",
  "leak_id",
  "date",
  "time",
  "action",
  "user",
  "text",
  "to",
  "changes",
];

const MONITORING_KEYS = [
  "index",
  "leak_id",
  "roundNumber",
  "date",
  "time",
  "monitoredBy",
  "result",
  "materials_equipment",
  "comment",
  "photo",
  "previousPhoto",
];

const MONITORING_ANSWERS = ["still_leaking", "needs_recheck", "resolved"];

const SUMMARY_LABELS = [
  "project",
  "projectType",
  "exportedAt",
  "leaks",
  "monitoringChecks",
  "historyRecords",
  "currentRound",
  "checkedInRound",
  "totalInRound",
  "remainingInRound",
  "schemaVersion",
];

const PROJECT_TYPES = ["upstream", "midstream", "downstream"];

const byKey = (keys, resolve) =>
  fromEntries(keys.map((key) => [key, resolve(key)]));

/**
 * Every string the workbook needs, resolved up front.
 *
 * The workbook is built inside a Web Worker, which has neither i18next nor a
 * React context, so the strings cross the worker boundary as data rather than
 * the worker looking them up. That is also why this is a plain object: it has
 * to survive structured cloning.
 */
export function buildExcelExportTexts(t) {
  return {
    sheets: {
      leaks: t("excelExport.sheets.leaks"),
      history: t("excelExport.sheets.history"),
      monitoring: t("excelExport.sheets.monitoring"),
    },
    photo: {
      open: t("excelExport.photo.open"),
      missing: t("excelExport.photo.missing"),
    },
    history: {
      unknownUser: t("excelExport.history.unknownUser"),
      headers: byKey(HISTORY_KEYS, (key) =>
        t(`excelExport.history.headers.${key}`),
      ),
    },
    monitoring: {
      headers: byKey(MONITORING_KEYS, (key) =>
        t(`excelExport.monitoring.headers.${key}`),
      ),
      answers: byKey(MONITORING_ANSWERS, (key) =>
        t(`excelExport.monitoring.answers.${key}`),
      ),
    },
    backup: {
      title: t("excelExport.backup.title"),
      note: t("excelExport.backup.note"),
      fieldColumn: t("excelExport.backup.fieldColumn"),
      valueColumn: t("excelExport.backup.valueColumn"),
      roundNumberFormat: t("excelExport.backup.roundNumberFormat"),
      projectTypes: byKey(PROJECT_TYPES, (key) =>
        t(`excelExport.backup.projectTypes.${key}`),
      ),
      summary: byKey(SUMMARY_LABELS, (key) =>
        t(`excelExport.backup.summary.${key}`),
      ),
    },
  };
}
