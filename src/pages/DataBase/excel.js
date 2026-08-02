import { compareLeakIds } from "@/utils/leakOrder";
import {
  allocateUniqueLeakArchiveSegments,
  sanitizePortableArchiveSegment,
} from "@/services/archivePaths";
const getExcelJS = () => import("exceljs");
const getJSZip = () => import("jszip");

import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";
import {
  EXCEL_MONITORING_EXPORT_MODE,
  normalizeExcelMonitoringExportMode,
} from "@/utils/excelExportMode";
import {
  buildLeakPhotoEntries,
  buildMonitoringPhotoEntries,
  buildPhotoMap,
  buildPortableLeaks,
  PHOTO_KEYS,
} from "@/services/excelExport/photoPipeline";
import {
  addBackupSheet,
  BACKUP_SCHEMA_VERSION,
} from "@/services/excelExport/backupSheet";
import {
  applyColumnFormats,
  formatLeakTime,
  toExcelCellValue,
} from "@/services/excelExport/cellValues";
import {
  buildMonitoringRoundLookup,
  getMonitoringExportRows,
} from "@/services/excelExport/monitoringRows";
import {
  buildHistorySheet,
  buildMonitoringSheet,
} from "@/services/excelExport/auxiliarySheets";
import {
  addStructuredTable,
  getColumnWidth,
  styleBodyRows,
  styleHeaderRow,
  yieldToMainThread,
} from "@/services/excelExport/sheetLayout";

const DEFAULT_EXPORT_DIR = "export/xlsx";
const LEAKS_TABLE_THEME = "TableStyleMedium2";
const EXPORT_YIELD_EVERY = 40;

function getExportFolder(projectFolderName) {
  return projectFolderName
    ? `${projectFolderName}/${DEFAULT_EXPORT_DIR}`
    : DEFAULT_EXPORT_DIR;
}

function releaseWorkbook(workbook) {
  if (
    typeof workbook?.removeWorksheet !== "function" ||
    !Array.isArray(workbook.worksheets)
  ) {
    return;
  }

  for (const worksheet of [...workbook.worksheets]) {
    workbook.removeWorksheet(worksheet.id);
  }
}

async function buildPhotoEntries(
  orderedLeaks,
  idbGet,
  monitoringExportMode,
  photoReadCache,
  archiveRoot = "photos",
) {
  const leakSegments = allocateUniqueLeakArchiveSegments(orderedLeaks);
  const includedMonitoringPhotoKeys =
    monitoringExportMode === EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND
      ? new Set(
          getMonitoringExportRows(
            orderedLeaks,
            buildMonitoringRoundLookup(orderedLeaks),
            monitoringExportMode,
          ).map((row) => row.photoMapKey),
        )
      : null;
  const [leakPhotos, monitoringPhotos] = await Promise.all([
    buildLeakPhotoEntries(
      orderedLeaks,
      leakSegments,
      idbGet,
      photoReadCache,
      archiveRoot,
    ),
    buildMonitoringPhotoEntries(
      orderedLeaks,
      leakSegments,
      idbGet,
      includedMonitoringPhotoKeys,
      photoReadCache,
      archiveRoot,
    ),
  ]);

  return [...leakPhotos, ...monitoringPhotos];
}
async function buildWorkbook({
  orderedLeaks,
  orderedRows,
  headers,
  keysOrder,
  photoMap,
  lang,
  ExcelJS,
  monitoringExportMode,
  archivePayload,
}) {
  const photoColumnIndexes = PHOTO_KEYS.map((key) =>
    keysOrder.indexOf(key),
  ).filter((index) => index !== -1);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(lang === "ru" ? "Утечки" : "Leaks");

  const tableRows = orderedRows.map((row, leakIndex) =>
    keysOrder.map((key) => {
      if (PHOTO_KEYS.includes(key) && photoMap[`${leakIndex}:${key}`]) {
        return "";
      }

      return toExcelCellValue(key, row[key]);
    }),
  );

  addStructuredTable(sheet, {
    name: "Leaks",
    headers,
    rows: tableRows,
    theme: LEAKS_TABLE_THEME,
  });
  styleHeaderRow(sheet, "FF1F4E78");
  await styleBodyRows(sheet, orderedRows.length);

  for (const [leakIndex, row] of orderedRows.entries()) {
    if (leakIndex > 0 && leakIndex % EXPORT_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }

    for (const columnIndex of photoColumnIndexes) {
      const key = keysOrder[columnIndex];
      const mapKey = `${leakIndex}:${key}`;
      const photoFile = photoMap[mapKey];
      const cell = sheet.getRow(leakIndex + 2).getCell(columnIndex + 1);

      if (photoFile) {
        cell.value = {
          text: lang === "ru" ? "Открыть фото" : "Open photo",
          hyperlink: photoFile,
        };
        cell.font = { color: { argb: "FF1155CC" }, underline: true };
      } else {
        cell.value = row[key]
          ? lang === "ru"
            ? "Есть (файл не найден)"
            : "Present (file missing)"
          : "";
      }
    }
  }

  applyColumnFormats(sheet, keysOrder);

  headers.forEach((header, index) => {
    const key = keysOrder[index];
    const isPhoto = PHOTO_KEYS.includes(key);
    sheet.getColumn(index + 1).width = getColumnWidth(
      header,
      key,
      orderedRows,
      {
        isPhoto,
      },
    );
  });

  await buildMonitoringSheet(
    workbook,
    orderedLeaks,
    lang,
    photoMap,
    monitoringExportMode,
  );
  await buildHistorySheet(workbook, orderedLeaks, lang);
  addBackupSheet(workbook, archivePayload, lang);

  return workbook;
}

export async function buildWorkbookBufferLocally(payload) {
  const ExcelJS = (await getExcelJS()).default;
  let workbook = await buildWorkbook({ ...payload, ExcelJS });

  await yieldToMainThread();
  const buffer = await workbook.xlsx.writeBuffer();
  releaseWorkbook(workbook);
  workbook = null;
  await yieldToMainThread();

  return buffer;
}

async function createWorkbookBuffer(payload, workerBuilder) {
  if (typeof workerBuilder === "function") {
    try {
      return await workerBuilder(payload);
    } catch (error) {
      logger.warn(
        "[excel] Worker export failed; falling back to the main thread:",
        error,
      );
    }
  }

  return buildWorkbookBufferLocally(payload);
}

async function downloadBlob(
  blob,
  fileName,
  outputFolder = DEFAULT_EXPORT_DIR,
  lang = "ru",
  webMessage = null,
) {
  if (!isNative) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);

    return {
      ok: true,
      message:
        webMessage ??
        (lang === "ru"
          ? `Файл экспортирован (${fileName})`
          : `File exported (${fileName})`),
    };
  }

  const { writePublicFile } = await import("@/services/publicFileWriter");
  await writePublicFile({
    folder: outputFolder,
    fileName,
    blob,
    mimeType: blob.type || "application/octet-stream",
  });

  return {
    ok: true,
    path: `${outputFolder}/${fileName}`,
    message:
      lang === "ru"
        ? `Сохранено в Документы/${outputFolder}/${fileName}`
        : `Saved to Documents/${outputFolder}/${fileName}`,
  };
}

export async function exportToExcelFile(
  rawLeaks,
  rows,
  headers,
  keysOrder,
  fileName = "утечки",
  idbGet = null,
  projectFolderName = null,
  lang = "ru",
  options = {},
) {
  const safeFileName = sanitizePortableArchiveSegment(fileName) || "report";
  const exportStartedAt = performance.now();
  const phaseMetrics = {};
  const paired = rawLeaks.map((leak, index) => ({ leak, row: rows[index] }));
  paired.sort((left, right) => compareLeakIds(left.leak, right.leak));

  const orderedLeaks = paired.map((pair) => pair.leak);
  const orderedRows = paired.map(({ leak, row }) => ({
    ...row,
    time: formatLeakTime(leak, row),
  }));
  const monitoringExportMode = normalizeExcelMonitoringExportMode(
    options.monitoringExportMode,
  );
  const photosStartedAt = performance.now();
  const photoReadCache = new Map();
  const reportPhotoEntries = await buildPhotoEntries(
    orderedLeaks,
    idbGet,
    monitoringExportMode,
    photoReadCache,
    "photos/report",
  );
  const backupLeaks = Array.isArray(options.backupLeaks)
    ? options.backupLeaks
    : orderedLeaks;
  const backupPhotoEntries = await buildPhotoEntries(
    backupLeaks,
    idbGet,
    EXCEL_MONITORING_EXPORT_MODE.FULL,
    photoReadCache,
  );
  const backupPhotoPathByLogicalKey = new Map(
    backupPhotoEntries.map((entry) => [entry.logicalKey, entry.photoFileName]),
  );
  const resolvedReportPhotoEntries = reportPhotoEntries.map((entry) => {
    const backupPath = backupPhotoPathByLogicalKey.get(entry.logicalKey);
    return backupPath ? { ...entry, photoFileName: backupPath } : entry;
  });
  const photoEntries = [
    ...new Map(
      [...resolvedReportPhotoEntries, ...backupPhotoEntries].map((entry) => [
        entry.photoFileName,
        entry,
      ]),
    ).values(),
  ];
  phaseMetrics.photosMs = performance.now() - photosStartedAt;
  const photoMap = buildPhotoMap(resolvedReportPhotoEntries);
  const backupPhotoMap = buildPhotoMap(backupPhotoEntries);
  const archivePayload = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project: options.project
      ? {
          name: options.project.name || fileName,
          type: options.project.type,
          folderName: options.project.folderName,
          syncId: options.project.syncId,
        }
      : null,
    vars: options.vars ?? null,
    settings: options.settings ?? null,
    monitoringRound: options.monitoringRound ?? null,
    sync: options.sync ?? null,
    leaks: buildPortableLeaks(backupLeaks, backupPhotoMap),
  };
  const outputFolder = getExportFolder(projectFolderName);

  const workbookStartedAt = performance.now();
  const xlsxBuffer = await createWorkbookBuffer(
    {
      orderedLeaks,
      orderedRows,
      headers,
      keysOrder,
      photoMap,
      lang,
      monitoringExportMode,
      archivePayload,
    },
    options.buildWorkbookBuffer,
  );

  phaseMetrics.workbookMs = performance.now() - workbookStartedAt;
  const zipStartedAt = performance.now();
  const JSZip = (await getJSZip()).default;
  const zip = new JSZip();
  zip.file(`${safeFileName}.xlsx`, xlsxBuffer);

  for (const [index, entry] of photoEntries.entries()) {
    if (index > 0 && index % EXPORT_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }
    zip.file(entry.photoFileName, entry.base64, { base64: true });
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  phaseMetrics.zipMs = performance.now() - zipStartedAt;
  phaseMetrics.totalMs = performance.now() - exportStartedAt;
  const result = await downloadBlob(
    zipBlob,
    `${safeFileName}.zip`,
    outputFolder,
    lang,
    lang === "ru"
      ? `Excel-архив проекта экспортирован (${safeFileName}.zip)`
      : `Excel project archive exported (${safeFileName}.zip)`,
  );
  return { ...result, metrics: phaseMetrics };
}

export const exportToExcelZip = exportToExcelFile;
