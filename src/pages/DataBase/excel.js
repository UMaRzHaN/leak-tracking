import { getLeakEvents } from "@/domain/leakEvents";
import { sanitizePortableArchiveSegment } from "@/services/archive/archivePaths";
const getJSZip = () => import("jszip");

import { isNative } from "@/utils/platform";
import { normalizeExcelMonitoringExportMode } from "@/utils/excelExportMode";
import { resolvePhotoExportData } from "./excelPhotoData";
import { withPortablePhotoValues } from "@/utils/photoValues";
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

/**
 * Книгу собирает воркер, и только он.
 *
 * Запасной сборщик на главном потоке здесь был, и убран не ради стройности:
 * он тянул в граф приложения вторую копию ExcelJS — 900 кБ, которые сервис-
 * воркер клал в кэш каждому, чтобы почти никогда ими не воспользоваться.
 * Модульные воркеры есть во всех WebView, до которых дотягивается minSdk, так
 * что отказ здесь означает не «старое устройство», а сломанную сборку — и
 * человеку честнее увидеть ошибку, чем ждать, пока подвиснет интерфейс.
 */
/**
 * Какие разделы идут с фото. `includePhotos: false` — старый общий
 * переключатель: без фото везде.
 */
function sectionPhotoChoice(options) {
  const all = options.includePhotos !== false;
  const sections = options.photoSections ?? {};
  return {
    leaks: all && sections.leaks !== false,
    repairs: all && sections.repairs !== false,
    monitoring: all && sections.monitoring !== false,
  };
}

/**
 * Раздел снимка — по ключу, под которым его ждёт лист. Снимок ленты
 * относится к ремонтам, только если событие ремонтное: осмотр в ленте — это
 * та же запись обхода, и её снимок — снимок мониторинга.
 */
function photoSectionOf(mapKey, orderedLeaks) {
  if (mapKey.startsWith("monitoring:")) return "monitoring";
  if (mapKey.startsWith("event:")) {
    const [, leakIndex, eventIndex] = mapKey.split(":");
    const event = getLeakEvents(orderedLeaks[Number(leakIndex)])[
      Number(eventIndex)
    ];
    return String(event?.type ?? "").startsWith("repair")
      ? "repairs"
      : "monitoring";
  }
  return "leaks";
}

/**
 * Оставляет ссылки только включённых разделов — и только те файлы, на
 * которые указывает хоть одна оставшаяся ссылка. Фильтр стоит после
 * сборки, а не до: один файл бывает общим у колонки и осмотра, и решать по
 * нему можно лишь по всем ссылкам сразу.
 */
export function keepPhotoSections(resolved, sections, orderedLeaks = []) {
  if (Object.values(sections).every(Boolean)) return resolved;
  const photoMap = {};
  for (const [mapKey, file] of Object.entries(resolved.photoMap)) {
    if (sections[photoSectionOf(mapKey, orderedLeaks)]) {
      photoMap[mapKey] = file;
    }
  }
  const kept = new Set(Object.values(photoMap));
  const backupPhotoMap = {};
  for (const [mapKey, file] of Object.entries(resolved.backupPhotoMap)) {
    if (kept.has(file)) backupPhotoMap[mapKey] = file;
  }
  return {
    photoMap,
    backupPhotoMap,
    photoEntries: resolved.photoEntries.filter((entry) =>
      kept.has(entry.photoFileName),
    ),
  };
}

async function createWorkbookBuffer(payload, workerBuilder) {
  if (typeof workerBuilder !== "function") {
    throw new Error("Excel export requires the workbook worker");
  }
  return workerBuilder(payload);
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
  // Снимки приводятся до сборщиков: одно порченое значение в записи роняло всю
  // книгу на `path.startsWith` — см. `withPortablePhotoValues`.
  const portableLeaks = await withPortablePhotoValues(rawLeaks);
  const paired = portableLeaks.map((leak, index) => ({
    leak,
    row: rows[index],
  }));

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
    ? await withPortablePhotoValues(options.backupLeaks)
    : orderedLeaks;
  // photoEntries (each holding a full base64 photo) is the only heavy value
  // kept from this call; the larger intermediate arrays it was derived from
  // are freed here, before the workbook build below.
  // Фото по разделам (8a): у листа утечек, ремонтов и мониторинга свой
  // переключатель. Если не нужно ни одно, снимки не читаются вовсе — это
  // самая долгая часть выгрузки.
  const photoSections = sectionPhotoChoice(options);
  const anyPhotos = Object.values(photoSections).some(Boolean);
  const resolved = anyPhotos
    ? await resolvePhotoExportData({
        orderedLeaks,
        backupLeaks,
        idbGet,
        monitoringExportMode,
        photoReadCache,
        folderTexts: { folderStatus: texts.photo.folderStatus },
      })
    : { photoMap: {}, backupPhotoMap: {}, photoEntries: [] };
  const { photoMap, backupPhotoMap, photoEntries } = keepPhotoSections(
    resolved,
    photoSections,
    orderedLeaks,
  );
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
      sheets: options.sheets ?? {},
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

  // Инвентаризация в том же архиве (8a): своя книга и снимки отдельной
  // папкой, чтобы получатель отчёта по утечкам видел, где чужая работа.
  if (typeof options.addToArchive === "function") {
    await options.addToArchive(zip);
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
