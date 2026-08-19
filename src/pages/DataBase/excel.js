import { buildWorkbookBufferLocally } from "@/services/excelExport/buildWorkbookBuffer";
import {
  allocateUniqueLeakArchiveSegments,
  sanitizePortableArchiveSegment,
} from "@/services/archive/archivePaths";
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
} from "@/services/excelExport/photoPipeline";
import { BACKUP_SCHEMA_VERSION } from "@/services/excelExport/backupSheet";
import { buildExcelExportTexts } from "@/services/excelExport/exportTexts";
import { formatLeakTime } from "@/services/excelExport/cellValues";
import {
  buildMonitoringRoundLookup,
  getMonitoringExportRows,
} from "@/services/excelExport/monitoringRows";
import { yieldToMainThread } from "@/services/excelExport/sheetLayout";

const DEFAULT_EXPORT_DIR = "export/xlsx";
const EXPORT_YIELD_EVERY = 40;

function getExportFolder(projectFolderName) {
  return projectFolderName
    ? `${projectFolderName}/${DEFAULT_EXPORT_DIR}`
    : DEFAULT_EXPORT_DIR;
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
// Resolves report + backup photo entries (each holding a full base64 copy of
// one photo) and reduces them down to what the rest of the export actually
// needs going forward: two lightweight path maps and the deduped entry list
// used later by the zip-assembly loop. Keeping this in its own function
// means the larger intermediate arrays below (reportPhotoEntries,
// resolvedReportPhotoEntries, backupPhotoEntries, and the lookup Map built
// from them) become unreachable — and collectible — as soon as this
// function returns, instead of staying resident for the entire, separately
// slow, workbook-building phase that follows in exportToExcelFile.
async function resolvePhotoExportData({
  orderedLeaks,
  backupLeaks,
  idbGet,
  monitoringExportMode,
  photoReadCache,
}) {
  const reportPhotoEntries = await buildPhotoEntries(
    orderedLeaks,
    idbGet,
    monitoringExportMode,
    photoReadCache,
    "photos/report",
  );
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
  const photoMap = buildPhotoMap(resolvedReportPhotoEntries);
  const backupPhotoMap = buildPhotoMap(backupPhotoEntries);

  return { photoMap, backupPhotoMap, photoEntries };
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
  idbGet = null,
  projectFolderName = null,
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
      componentSheet: options.componentSheet ?? null,
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

  // Drawings ride beside the photos so the archive stays openable by hand:
  // "!Database.xlsx" next to photos/ next to technological_schemas/.
  for (const entry of options.schemaEntries ?? []) {
    zip.file(entry.path, entry.blob);
  }

  // The registry as plain JSON beside the workbook: the sheet is for reading,
  // this is what another device merges from.
  if (options.componentArchive) {
    zip.file(options.componentArchive.path, options.componentArchive.content);
    // The pictures the registry's paths now point at. Without them the JSON is
    // a set of dead references on any device but this one.
    for (const entry of options.componentArchive.photoEntries ?? []) {
      zip.file(entry.path, entry.blob);
    }
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
