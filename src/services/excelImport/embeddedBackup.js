import {
  validateBackup,
  validateProjectBackupMeta,
} from "@/repositories/backupSchema";
import { getCellDisplayValue } from "./workbookSchema";

const BACKUP_SHEET_NAME = "Project Backup";
const BACKUP_MARKER = "LEAK_TRACKER_EXCEL_BACKUP";

export function parseEmbeddedBackup(workbook) {
  const sheet = workbook.getWorksheet(BACKUP_SHEET_NAME);
  if (!sheet) return null;
  if (
    String(getCellDisplayValue(sheet.getRow(1).getCell(1))) !== BACKUP_MARKER
  ) {
    return null;
  }

  const chunks = [];
  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const index = Number(getCellDisplayValue(row.getCell(1)));
    const chunk = getCellDisplayValue(row.getCell(2));
    if (Number.isInteger(index) && index > 0 && typeof chunk === "string") {
      chunks.push({ index, chunk });
    }
  }
  chunks.sort((left, right) => left.index - right.index);
  if (!chunks.length) throw new Error("Project Backup sheet is empty");

  let payload;
  try {
    payload = JSON.parse(chunks.map((entry) => entry.chunk).join(""));
  } catch {
    throw new Error("Project Backup sheet contains invalid data");
  }

  const validation = validateBackup(payload?.leaks);
  if (!validation.ok) throw new Error(validation.error);
  const hasProjectMetadata = payload?.project != null;
  const metadataInput = {
    ...(payload.schemaVersion != null
      ? { schemaVersion: payload.schemaVersion }
      : {}),
    ...(payload.exportedAt != null ? { exportedAt: payload.exportedAt } : {}),
    project: hasProjectMetadata
      ? payload.project
      : { name: "Embedded Excel backup", type: "upstream" },
    ...(payload.vars != null ? { vars: payload.vars } : {}),
    ...(payload.settings != null ? { settings: payload.settings } : {}),
    ...(payload.monitoringRound != null
      ? { monitoringRound: payload.monitoringRound }
      : {}),
    ...(payload.sync != null ? { sync: payload.sync } : {}),
  };
  const metadataValidation = validateProjectBackupMeta(metadataInput);
  if (!metadataValidation.ok) {
    throw new Error(metadataValidation.error);
  }
  const metadata = metadataValidation.data;
  const project = hasProjectMetadata
    ? {
        ...metadata.project,
        name: metadata.project.name.trim(),
        ...(metadata.project.syncId
          ? { syncId: metadata.project.syncId.trim() }
          : {}),
      }
    : null;

  return {
    ...payload,
    ...(metadata ?? {}),
    project,
    leaks: validation.data,
  };
}
