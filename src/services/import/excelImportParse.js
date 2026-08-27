import { appError } from "@/utils/appError";
// Pure parsing half of the Excel import: file in, plain data out. Nothing here
// may reach for Capacitor, the DOM or storage — this module is what
// services/excel/excel.worker.js loads, and the worker has none of them.

const getExcelJS = () => import("exceljs");
const getJSZip = () => import("jszip");

import { inferMonitoringRound } from "@/utils/monitoringRound";
import { hydrateZipPhotos } from "@/services/import/zipPhotoHydration";
import {
  attachHistoryRecords,
  attachMonitoringRecords,
} from "@/services/import/recordMerge";
import {
  buildHeaderMap,
  findHeaderRow,
  findHistorySheet,
  findLeakSheet,
  findMonitoringSheet,
  getCellDisplayValue,
  getCellPhotoValue,
} from "@/services/import/workbookSchema";
import { parseEmbeddedBackup } from "@/services/import/embeddedBackup";
import { mergeSheetEditsIntoBackup } from "@/services/import/backupSheetMerge";
import {
  isRecognizedStatus,
  isValidPhotoPath,
  isPhotoCellKey,
  normalizeCellValue,
  normalizeImportedLeak,
  parseNumberValue,
} from "@/services/import/valueNormalization";
import { normalizeLeakTag } from "@/utils/leakIdentity";
import { isValidLatitude, isValidLongitude } from "@/utils/coordinates";
import {
  parseHistoryRecords,
  parseMonitoringRecords,
} from "@/services/import/sheetRecordParsers";
import {
  assertArchiveLimits,
  assertImportFileSize,
  preflightZipFile,
  readArchiveEntry,
  verifyArchiveLimits,
} from "@/utils/importLimits";
import { IMPORT_ROW_YIELD_EVERY } from "@/services/backup/constants";
import { yieldToMainThread } from "@/services/backup/runtime";

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

/**
 * @param {{name?: string, size: number, arrayBuffer: () => Promise<ArrayBuffer>}} file
 * @param {{projectType?: string}} [options]
 * @param {{buffer: ArrayBuffer, zip: any}|null} [opened] уже прочитанный файл —
 *   чтобы распознавание не заставило читать и распаковывать книгу дважды
 */
export async function parseExcelLeaks(
  file,
  { projectType } = {},
  opened = null,
) {
  assertImportFileSize(file);
  await preflightZipFile(file);
  const ExcelJS = (await getExcelJS()).default;
  const workbook = new ExcelJS.Workbook();
  const buffer = opened?.buffer ?? (await file.arrayBuffer());
  const workbookArchive =
    opened?.zip ?? (await (await getJSZip()).default.loadAsync(buffer));
  await verifyArchiveLimits(workbookArchive);
  await workbook.xlsx.load(buffer);

  const embeddedBackup = parseEmbeddedBackup(workbook);
  if (embeddedBackup) {
    // Видимый лист читается и здесь: он же и есть то, что человек правит в
    // Excel, а слепок сам по себе о его правках не знает.
    const sheet = await parseLeakSheets(workbook, {
      projectType: embeddedBackup.project?.type ?? projectType,
    });
    const merged = mergeSheetEditsIntoBackup(
      embeddedBackup.leaks,
      sheet.leaks,
      { sheetRows: sheet.sheetRows },
    );

    return {
      leaks: merged.leaks,
      stats: {
        totalRows: merged.leaks.length,
        imported: merged.leaks.length,
        skipped: 0,
        exactBackup: merged.edited === 0 && merged.added === 0,
        sheetEdited: merged.edited,
        sheetAdded: merged.added,
        sheetMissing: merged.missing,
        validationWarnings: sheet.stats.validationWarnings ?? [],
        validationWarningCount: sheet.stats.validationWarningCount ?? 0,
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

  return parseLeakSheets(workbook, { projectType });
}

/**
 * Утечки с видимых листов книги — строки таблицы, обходы и история.
 *
 * @param {any} workbook
 * @param {{projectType?: string}} options
 */
async function parseLeakSheets(workbook, { projectType } = {}) {
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
  // Строки листа как они есть — до того как нормализатор дописал в них
  // недостающее. Слияние берёт правки отсюда: правкой человека может быть
  // только то, что таблица действительно дала.
  const sheetRows = [];
  let totalRows = 0;
  let skipped = 0;
  let duplicateLeakIds = 0;
  const validation = createValidationCollector();

  for (
    let rowNumber = headerRow.rowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    // Parsing a large sheet is thousands of iterations of pure CPU work with
    // no I/O to interrupt it, so without this the main thread is blocked for
    // the whole parse and the import UI cannot paint or report progress.
    // Mirrors the yield the export path already performs between photos.
    if ((rowNumber - headerRow.rowNumber) % IMPORT_ROW_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }
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
          "Неизвестный статус; значение не импортировано",
        );
      }
      if (["lat", "lng"].includes(column.key) && String(value ?? "").trim()) {
        const coordinate = parseNumberValue(value);
        const validRange =
          column.key === "lat"
            ? isValidLatitude(coordinate)
            : isValidLongitude(coordinate);
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

    const leakTag = normalizeLeakTag(leak.leak_id);
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
    if (raw.status) explicitStatusLeakIds.add(leakTag);
    leaks.push(leak);
    sheetRows.push(raw);
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
    .filter((leak) => {
      const leakKey = normalizeLeakTag(leak.leak_id);
      return (
        leakKey &&
        !explicitStatusLeakIds.has(leakKey) &&
        monitoring.recordsByLeakId.has(leakKey)
      );
    })
    .map((leak) => String(leak.leak_id));
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
    sheetRows,
    project: resolvedProjectType ? { type: resolvedProjectType } : null,
  };
}

/** Единственная запись, по которой zip опознаётся как книга Excel. */
const WORKBOOK_ENTRY = "xl/workbook.xml";

/** Файл, прочитанный как zip, или null, если он не zip. */
async function openArchive(file) {
  const buffer = await file.arrayBuffer();
  // Загрузчик — вне try, чтобы не загрузившийся jszip не выдавал себя за
  // файл, который не является zip.
  const JSZip = (await getJSZip()).default;
  try {
    return { buffer, zip: await new JSZip().loadAsync(buffer) };
  } catch {
    return null;
  }
}

export async function parseExcelImportFile(file, options = {}) {
  assertImportFileSize(file);
  await preflightZipFile(file);

  const opened = await openArchive(file);

  // Не zip вовсе — пусть книгу читает ExcelJS, ошибку про испорченный файл
  // выдаст он.
  if (!opened) {
    const parsed = await parseExcelLeaks(file, options);
    return { ...parsed, project: parsed.project ?? null };
  }

  // Голая книга: и .xlsx, и архив с фотографиями — zip, отличает их только
  // содержимое. Имя и MIME-тип для этого не годятся: файл, выбранный через
  // системный проводник Android, приходит с тем именем и типом, какие отдал
  // провайдер, вплоть до «document» и «application/octet-stream», — и архив,
  // прочитанный как книга, разбирался в ноль строк без единой ошибки.
  if (opened.zip.file(WORKBOOK_ENTRY)) {
    const parsed = await parseExcelLeaks(file, options, opened);
    return { ...parsed, project: parsed.project ?? null };
  }

  const zip = opened.zip;
  // Header preflight only: the reads below enforce the real byte limits as
  // they decompress, so the archive is no longer expanded twice.
  assertArchiveLimits(zip);
  let project = null;
  // Файл из старых выгрузок: тип и имя проекта лежали рядом с книгой, пока их
  // не перенесли в служебный лист внутри неё. Выгрузка его больше не пишет —
  // чтение остаётся ради архивов, которые люди уже унесли на диски и в почту.
  const projectEntry = zip.file("excel-project.json");
  if (projectEntry) {
    try {
      const manifest = JSON.parse(
        await readArchiveEntry(zip, projectEntry, "string"),
      );
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
    throw appError("ZIP_NO_XLSX", "В ZIP не найден Excel-файл .xlsx");
  }

  const buffer = await readArchiveEntry(zip, xlsxEntry, "arraybuffer");
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
