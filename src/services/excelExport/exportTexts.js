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
  "physicalTag",
  "fiction",
  "materials_equipment",
  "comment",
  "photo",
  "previousPhoto",
];

const MATERIALS_KEYS = [
  "index",
  "leak_id",
  "date",
  "time",
  "source",
  "materials_equipment",
  "user",
];

const REPAIR_KEYS = [
  "index",
  "leak_id",
  "attempt",
  "repairAt",
  "repairTime",
  "resolvedAt",
  "resolvedTime",
  "durationHours",
  "user",
  "brigade",
  "materials_equipment",
  "note",
  "repairPhoto",
  "donePhoto",
];

const REPAIR_LOG_KEYS = [
  "index",
  "leak_id",
  "date",
  "time",
  "event",
  "brigade",
  "materials_equipment",
  "note",
  "user",
  "previousPhoto",
  "photo",
];
const REPAIR_LOG_EVENTS = [
  "repair_started",
  "repair_done",
  "returned",
  "waiting_mtr",
  "in_repair",
  "ready",
  "resolved",
];

const ACCEPTANCE_KEYS = [
  "invoice",
  "supplier",
  "warehouse",
  "status",
  "batch",
  "date",
  "time",
  "name",
  "unit",
  "ordered",
  "qty",
  "received",
  "left",
  "complete",
  "dnpnMatch",
  "remark",
  "user",
];
const ACCEPTANCE_STATUSES = ["pending", "partial", "accepted"];
const ACCEPTANCE_UNITS = ["pcs", "set", "m", "kg", "l"];

const PHOTO_FOLDER_STATUSES = ["open", "in_progress", "resolved"];

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
      repairs: t("excelExport.sheets.repairs"),
      materials: t("excelExport.sheets.materials"),
      repairLog: t("excelExport.sheets.repairLog"),
      acceptance: t("excelExport.sheets.acceptance"),
    },
    photo: {
      open: t("excelExport.photo.open"),
      missing: t("excelExport.photo.missing"),
      noPlace: t("excelExport.photo.noPlace"),
      folderStatus: byKey(PHOTO_FOLDER_STATUSES, (key) =>
        t(`excelExport.photo.folderStatus.${key}`),
      ),
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
      flags: {
        yes: t("excelExport.monitoring.flags.yes"),
        no: t("excelExport.monitoring.flags.no"),
      },
    },
    repairs: {
      headers: byKey(REPAIR_KEYS, (key) =>
        t(`excelExport.repairs.headers.${key}`),
      ),
    },
    repairLog: {
      headers: byKey(REPAIR_LOG_KEYS, (key) =>
        t(`excelExport.repairLog.headers.${key}`),
      ),
      events: byKey(REPAIR_LOG_EVENTS, (key) =>
        t(`excelExport.repairLog.events.${key}`),
      ),
    },
    acceptance: {
      headers: byKey(ACCEPTANCE_KEYS, (key) =>
        t(`excelExport.acceptance.headers.${key}`),
      ),
      statuses: byKey(ACCEPTANCE_STATUSES, (key) =>
        t(`acceptance.status.${key}`),
      ),
      units: byKey(ACCEPTANCE_UNITS, (key) =>
        t(`acceptance.units.${key}.short`),
      ),
      yes: t("repairs.yes"),
      no: t("repairs.no"),
    },
    materials: {
      headers: byKey(MATERIALS_KEYS, (key) =>
        t(`excelExport.materials.headers.${key}`),
      ),
      sources: {
        repair: t("excelExport.materials.sources.repair"),
        monitoring: t("excelExport.materials.sources.monitoring"),
      },
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
