import { buildWorkbookBufferLocally } from "@/services/excelExport/buildWorkbookBuffer";
import { sanitizePortableArchiveSegment } from "@/services/archive/archivePaths";
const getJSZip = () => import("jszip");

import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";
import { normalizeExcelMonitoringExportMode } from "@/utils/excelExportMode";
import { resolvePhotoExportData } from "./excelPhotoData";
import { buildPortableLeaks } from "@/services/excelExport/portableLeaks";
import { BACKUP_SCHEMA_VERSION } from "@/services/excelExport/backupSheet";
import { buildExcelExportTexts } from "@/services/excelExport/exportTexts";
import { formatLeakTime } from "@/services/excelExport/cellValues";
import { yieldToMainThread } from "@/services/excelExport/sheetLayout";
import {
  LEAK_XLSX_DIR,
  projectExportFolder,
} from "@/services/storage/exportFolders";

const DEFAULT_EXPORT_DIR = LEAK_XLSX_DIR;
const EXPORT_YIELD_EVERY = 40;

function getExportFolder(projectFolderName) {
  return projectExportFolder(projectFolderName, LEAK_XLSX_DIR);
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
  t,
  webMessage = /** @type {string|null} */ (null),
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
      message: webMessage ?? t("excelExport.downloaded", { fileName }),
    };
  }

  const { writePublicFile } =
    await import("@/services/storage/publicFileWriter");
  await writePublicFile({
    folder: outputFolder,
    fileName,
    blob,
    mimeType: blob.type || "application/octet-stream",
  });

  return {
    ok: true,
    path: `${outputFolder}/${fileName}`,
    message: t("excelExport.saved", { path: `${outputFolder}/${fileName}` }),
  };
}

export async function exportToExcelFile(
  rawLeaks,
  rows,
  headers,
  keysOrder,
  fileName = "утечки",
  idbGet = /** @type {((id: string) => Promise<any>)|null} */ (null),
  projectFolderName = /** @type {string|null} */ (null),
  t,
  options = {},
) {
  const texts = buildExcelExportTexts(t);
  const safeFileName = sanitizePortableArchiveSegment(fileName) || "report";
  const exportStartedAt = performance.now();
  const phaseMetrics = {};
  // Deliberately not re-sorted. The caller hands over exactly what the database
  // screen shows, already filtered and ordered by the user's own date toggle;
  // re-sorting here threw that away and put the sheet in order of record id,
  // which for anything added in the app is a random UUID. The `No` column comes
  // from the record rather than the row position, so those numbers came out
  // shuffled too.
  const paired = rawLeaks.map((leak, index) => ({ leak, row: rows[index] }));

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
  const backupLeaks = Array.isArray(options.backupLeaks)
    ? options.backupLeaks
    : orderedLeaks;
  // photoEntries (each holding a full base64 photo) is the only heavy value
  // kept from this call; the larger intermediate arrays it was derived from
  // are freed here, before the workbook build below.
  const { photoMap, backupPhotoMap, photoEntries } =
    await resolvePhotoExportData({
      orderedLeaks,
      backupLeaks,
      idbGet,
      monitoringExportMode,
      photoReadCache,
    });
  photoReadCache.clear();
  phaseMetrics.photosMs = performance.now() - photosStartedAt;
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
      texts,
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
    // JSZip decodes base64 into its own internal bytes synchronously above,
    // so our copy of the string is redundant from this point on. Dropping it
    // per-entry (rather than only when the whole photoEntries array goes out
    // of scope) lets the GC reclaim already-zipped photos incrementally
    // while later ones are still being processed, instead of peaking at
    // "every photo's base64 string, all at once" for the whole loop.
    entry.base64 = null;
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  phaseMetrics.zipMs = performance.now() - zipStartedAt;
  phaseMetrics.totalMs = performance.now() - exportStartedAt;
  const result = await downloadBlob(
    zipBlob,
    `${safeFileName}.zip`,
    outputFolder,
    t,
    t("excelExport.archiveExported", { fileName: `${safeFileName}.zip` }),
  );
  return { ...result, metrics: phaseMetrics };
}

export const exportToExcelZip = exportToExcelFile;

// Re-exported so the export page keeps one entry point.
export { buildWorkbookBufferLocally };
