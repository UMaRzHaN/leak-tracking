const getExcelJS = () => import("exceljs");
const getJSZip = () => import("jszip");

import { inferMonitoringRound } from "@/utils/monitoringRound";
import {
  hydrateZipPhotos,
  isZipFile,
  persistExcelImportPhotos,
  reconcileExcelImportPhotos,
} from "@/services/excelImport/photoPipeline";
import {
  attachHistoryRecords,
  attachMonitoringRecords,
} from "@/services/excelImport/recordMerge";
import {
  buildHeaderMap,
  findHeaderRow,
  findHistorySheet,
  findLeakSheet,
  findMonitoringSheet,
  getCellDisplayValue,
  getCellPhotoValue,
} from "@/services/excelImport/workbookSchema";
import {
  validateBackup,
  validateProjectBackupMeta,
} from "@/repositories/backupSchema";
import {
  isRecognizedStatus,
  isValidPhotoPath,
  isPhotoCellKey,
  normalizeCellValue,
  normalizeImportedLeak,
  parseNumberValue,
} from "@/services/excelImport/valueNormalization";
import {
  parseHistoryRecords,
  parseMonitoringRecords,
} from "@/services/excelImport/sheetRecordParsers";
import {
  assertImportFileSize,
  preflightZipFile,
  verifyArchiveLimits,
} from "@/utils/importLimits";

export { persistExcelImportPhotos, reconcileExcelImportPhotos };

function createValidationCollector() {
  const warnings = [];
  let count = 0;
  return {
    add(sheet, row, column, value, message) {
      count += 1;
      if (warnings.length < 200) {
        warnings.push({
          sheet,
          row,
          column,
          value: String(value ?? "").slice(0, 200),
          message,
        });
      }
    },
    get count() {
      return count;
    },
    get warnings() {
      return warnings;
    },
  };
}

function parseEmbeddedBackup(workbook) {
  const sheet = workbook.getWorksheet("Project Backup");
  if (!sheet) return null;
  if (
    String(getCellDisplayValue(sheet.getRow(1).getCell(1))) !==
    "LEAK_TRACKER_EXCEL_BACKUP"
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

export async function parseExcelLeaks(file, { projectType } = {}) {
  assertImportFileSize(file);
  await preflightZipFile(file);
  const ExcelJS = (await getExcelJS()).default;
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  const JSZip = (await getJSZip()).default;
  const workbookArchive = await JSZip.loadAsync(buffer);
  await verifyArchiveLimits(workbookArchive);
  await workbook.xlsx.load(buffer);

  const embeddedBackup = parseEmbeddedBackup(workbook);
  if (embeddedBackup) {
    return {
      leaks: embeddedBackup.leaks,
      stats: {
        totalRows: embeddedBackup.leaks.length,
        imported: embeddedBackup.leaks.length,
        skipped: 0,
        exactBackup: true,
        validationWarnings: [],
        validationWarningCount: 0,
      },
      columns: [],
      sheetName: "Project Backup",
      monitoringRound: embeddedBackup.monitoringRound ?? null,
      project: embeddedBackup.project,
      vars: embeddedBackup.vars ?? null,
      settings: embeddedBackup.settings ?? null,
      sync: embeddedBackup.sync ?? null,
      portableArchive: true,
    };
  }

  const validTypes = ["upstream", "midstream", "downstream"];
  const requestedType = validTypes.includes(projectType) ? projectType : null;
  // Ordinary XLSX files do not contain reliable project metadata. Shared
  // headers must not be used to guess a type, because a downstream sheet can
  // otherwise be silently classified as upstream. When no type was supplied,
  // parse only the common/aliased columns and leave project selection to UI.
  const candidateTypes = requestedType ? [requestedType] : [null];
  const candidates = candidateTypes
    .map((type) => {
      const headerMap = buildHeaderMap(type);
      const sheet = findLeakSheet(workbook, headerMap);
      const headerRow = sheet ? findHeaderRow(sheet, headerMap) : null;
      return { type, headerMap, sheet, headerRow };
    })
    .filter((candidate) => candidate.sheet && candidate.headerRow);

  const selected = candidates[0];
  if (!selected) {
    return {
      leaks: [],
      stats: {
        totalRows: 0,
        imported: 0,
        skipped: 0,
        validationWarnings: [],
        validationWarningCount: 0,
      },
      columns: [],
      sheetName: "",
      project: requestedType ? { type: requestedType } : null,
    };
  }

  const { type: resolvedProjectType, sheet, headerRow } = selected;

  const leaks = [];
  const seenLeakTags = new Set();
  const explicitStatusLeakIds = new Set();
  let totalRows = 0;
  let skipped = 0;
  let duplicateLeakIds = 0;
  const validation = createValidationCollector();

  for (
    let rowNumber = headerRow.rowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const raw = {};

    for (const column of headerRow.columns) {
      const cell = row.getCell(column.columnNumber);
      const value = isPhotoCellKey(column.key)
        ? getCellPhotoValue(cell)
        : getCellDisplayValue(cell);
      if (
        column.key === "status" &&
        String(value ?? "").trim() &&
        !isRecognizedStatus(value)
      ) {
        validation.add(
          sheet.name,
          rowNumber,
          column.header,
          value,
          "Неизвестный статус; использовано значение open",
        );
      }
      if (["lat", "lng"].includes(column.key) && String(value ?? "").trim()) {
        const coordinate = parseNumberValue(value);
        const validRange =
          column.key === "lat"
            ? coordinate != null && coordinate >= -90 && coordinate <= 90
            : coordinate != null && coordinate >= -180 && coordinate <= 180;
        if (!validRange) {
          validation.add(
            sheet.name,
            rowNumber,
            column.header,
            value,
            "Некорректная координата; значение не импортировано",
          );
        }
      }
      if (
        isPhotoCellKey(column.key) &&
        String(value ?? "").trim() &&
        !isValidPhotoPath(
          String(value).startsWith("photos/") ? `zip:${value}` : String(value),
        )
      ) {
        validation.add(
          sheet.name,
          rowNumber,
          column.header,
          value,
          "Некорректный путь к фотографии; значение не импортировано",
        );
      }
      const normalized = normalizeCellValue(column.key, value, {
        percentFormatted: String(cell.numFmt ?? "").includes("%"),
      });
      if (normalized != null && normalized !== "") raw[column.key] = normalized;
    }

    if (!Object.keys(raw).length) continue;
    totalRows += 1;

    const leak = normalizeImportedLeak(raw, rowNumber, leaks.length + 1);
    if (!leak) {
      skipped += 1;
      validation.add(
        sheet.name,
        rowNumber,
        "row",
        "",
        "Строка пропущена: нет импортируемых данных",
      );
      continue;
    }

    const leakTag = String(leak.leak_id ?? "")
      .trim()
      .toLowerCase();
    if (leakTag && seenLeakTags.has(leakTag)) {
      skipped += 1;
      duplicateLeakIds += 1;
      validation.add(
        sheet.name,
        rowNumber,
        "leak_id",
        leak.leak_id,
        "Дубликат идентификатора утечки; строка пропущена",
      );
      continue;
    }
    if (leakTag) seenLeakTags.add(leakTag);
    if (raw.status) explicitStatusLeakIds.add(String(leak.leak_id));
    leaks.push(leak);
  }

  const monitoringSheet = findMonitoringSheet(workbook);
  const monitoring = monitoringSheet
    ? parseMonitoringRecords(monitoringSheet, validation)
    : { recordsByLeakId: new Map(), count: 0 };
  const historySheet = findHistorySheet(workbook);
  const history = historySheet
    ? parseHistoryRecords(historySheet)
    : { recordsByLeakId: new Map(), count: 0 };
  const leaksBeforeHistoryAttach = historySheet
    ? leaks.map((leak) => ({ ...leak, history: [] }))
    : leaks;
  const inferredStatusLeakIds = leaks
    .map((leak) => String(leak.leak_id))
    .filter(
      (id) =>
        !explicitStatusLeakIds.has(id) && monitoring.recordsByLeakId.has(id),
    );
  const leaksWithMonitoring = attachMonitoringRecords(
    leaksBeforeHistoryAttach,
    monitoring.recordsByLeakId,
    {
      inferStatusForLeakIds: new Set(inferredStatusLeakIds),
    },
  );
  const leaksWithHistory = attachHistoryRecords(
    leaksWithMonitoring,
    history.recordsByLeakId,
  );
  const monitoringRound = inferMonitoringRound(leaksWithHistory);

  return {
    leaks: leaksWithHistory,
    stats: {
      totalRows,
      imported: leaksWithHistory.length,
      skipped,
      duplicateLeakIds,
      recognizedColumns: headerRow.columns.length,
      monitoringRecords: monitoring.count,
      historyRecords: history.count,
      validationWarnings: validation.warnings,
      validationWarningCount: validation.count,
    },
    columns: headerRow.columns,
    sheetName: sheet.name,
    monitoringSheetName: monitoringSheet?.name ?? "",
    historySheetName: historySheet?.name ?? "",
    monitoringRound,
    inferredStatusLeakIds,
    project: resolvedProjectType ? { type: resolvedProjectType } : null,
  };
}

export async function parseExcelImportFile(file, options = {}) {
  assertImportFileSize(file);
  if (!isZipFile(file)) {
    const parsed = await parseExcelLeaks(file, options);
    return { ...parsed, project: parsed.project ?? null };
  }

  await preflightZipFile(file);
  const JSZip = (await getJSZip()).default;
  const zip = await JSZip.loadAsync(file);
  await verifyArchiveLimits(zip);
  let project = null;
  const projectEntry = zip.file("excel-project.json");
  if (projectEntry) {
    try {
      const manifest = JSON.parse(await projectEntry.async("string"));
      const type = manifest?.project?.type || manifest?.config;
      if (["upstream", "midstream", "downstream"].includes(type)) {
        project = {
          name: String(manifest?.project?.name ?? "").trim(),
          type,
        };
      }
    } catch {
      // Старые или повреждённые метаданные не блокируют импорт таблицы.
    }
  }
  const xlsxEntry = Object.values(zip.files).find(
    (entry) =>
      !entry.dir &&
      /\.xlsx$/i.test(entry.name) &&
      !entry.name.startsWith("__MACOSX/"),
  );

  if (!xlsxEntry) {
    throw new Error("В ZIP не найден Excel-файл .xlsx");
  }

  const buffer = await xlsxEntry.async("arraybuffer");
  const parsed = await parseExcelLeaks(
    {
      name: xlsxEntry.name,
      size: buffer.byteLength,
      arrayBuffer: async () => buffer,
    },
    { ...options, projectType: project?.type || options.projectType },
  );

  const hydrated = await hydrateZipPhotos(parsed, zip);
  const mergedProject =
    project || parsed.project
      ? {
          ...project,
          ...parsed.project,
        }
      : null;
  return { ...hydrated, project: mergedProject };
}
