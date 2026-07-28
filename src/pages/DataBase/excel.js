import { compareLeakIds } from "@/utils/leakOrder";
const getExcelJS = () => import("exceljs");
const getJSZip = () => import("jszip");

import { isNative } from "@/utils/platform";
import { getPhotoSrc } from "@/hooks/photoService";
import { blobToDataUri } from "@/utils/photoConversion";
import { logger } from "@/utils/logger";
import {
  getMonitoringAnswerLabel,
  getMonitoringRecords,
} from "@/utils/monitoring";
import {
  EXCEL_MONITORING_EXPORT_MODE,
  normalizeExcelMonitoringExportMode,
} from "@/utils/excelExportMode";

const PHOTO_KEYS = ["photo", "photo_after", "photo_repair"];
const DEFAULT_EXPORT_DIR = "export/xlsx";
const LEAKS_TABLE_THEME = "TableStyleMedium2";
const MONITORING_TABLE_THEME = "TableStyleMedium4";
const EXPORT_YIELD_EVERY = 40;
const PHOTO_READ_CONCURRENCY = 4;
const BACKUP_SHEET_NAME = "Project Backup";
const BACKUP_MARKER = "LEAK_TRACKER_EXCEL_BACKUP";
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_CHUNK_SIZE = 30_000;
const EXCEL_DATE_FORMAT = "dd.mm.yyyy";
const EXCEL_DATE_TIME_FORMAT = "dd.mm.yyyy hh:mm:ss";
const EXCEL_TIME_FORMAT = "hh:mm:ss";
const INTEGER_FORMAT = "#,##0";
const DECIMAL_FORMAT = "#,##0.00";
const COORDINATE_FORMAT = "0.000000";
const PERCENT_FORMAT = "0.0%";

const DATE_KEYS = new Set(["date", "repairAt", "resolvedAt"]);
const TIME_KEYS = new Set(["time"]);
const INTEGER_KEYS = new Set(["index", "roundNumber", "Operating_mode"]);
const PERCENT_KEYS = new Set([
  "flareShare",
  "utilShare",
  "gasPercentage",
  "uncertainty",
]);
const WHOLE_PERCENT_KEYS = new Set(["gasPercentage", "uncertainty"]);
const COORDINATE_KEYS = new Set(["lat", "lng"]);
const DECIMAL_KEYS = new Set([
  "pressure",
  "temperature",
  "temperature_K",
  "uncertainty",
  "gasPercentage",
  "leak_speed",
  "leak_speed_kg_h",
  "weightedGWP",
  "Total_Annual_Methane_Loss_m3_y",
  "Total_Annual_Methane_Loss_t_y",
  "Emissions_t_CO2eq_year",
  "Emissions_kg_CO2_eq_year",
]);
const TEXT_IDENTIFIER_KEYS = new Set(["video_id", "serial_number"]);

function yieldToMainThread() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

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

async function resolvePhotoSrc(path, idbGet) {
  if (!path) return null;

  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    const raw = idbGet ? await idbGet(id) : null;
    if (!raw) return null;
    return raw instanceof Blob ? blobToDataUri(raw) : raw;
  }

  return getPhotoSrc(path);
}

async function resolvePhotoCandidates(candidates, idbGet, photoReadCache) {
  if (candidates.length === 0) return [];

  const entries = new Array(candidates.length);
  let nextIndex = 0;
  let completed = 0;

  async function runWorker() {
    while (nextIndex < candidates.length) {
      const candidateIndex = nextIndex;
      nextIndex += 1;
      const candidate = candidates[candidateIndex];
      let sourcePromise = photoReadCache.get(candidate.path);
      if (!sourcePromise) {
        sourcePromise = resolvePhotoSrc(candidate.path, idbGet);
        photoReadCache.set(candidate.path, sourcePromise);
      }
      const src = await sourcePromise;

      if (src?.startsWith("data:")) {
        const match = src.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          const ext = match[1].split("/")[1] || "jpg";
          entries[candidateIndex] = {
            mapKey: candidate.mapKey,
            photoFileName: `${candidate.fileNameBase}.${ext}`,
            base64: match[2],
          };
        }
      }

      completed += 1;
      if (completed % EXPORT_YIELD_EVERY === 0) {
        await yieldToMainThread();
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(PHOTO_READ_CONCURRENCY, candidates.length) },
      () => runWorker(),
    ),
  );
  return entries.filter(Boolean);
}

async function buildLeakPhotoEntries(orderedLeaks, idbGet, photoReadCache) {
  const candidates = [];

  for (const [leakIndex, leak] of orderedLeaks.entries()) {
    for (const key of PHOTO_KEYS) {
      const path = leak[key];
      if (!path) continue;

      const suffix =
        key === "photo_after"
          ? "_after"
          : key === "photo_repair"
            ? "_repair"
            : "";
      const leakId = leak.leak_id ?? leak.index ?? leakIndex + 1;
      candidates.push({
        path,
        mapKey: `${leakIndex}:${key}`,
        fileNameBase: `photos/${leakId}/${leakId}${suffix}`,
      });
    }
  }

  return resolvePhotoCandidates(candidates, idbGet, photoReadCache);
}

async function buildMonitoringPhotoEntries(
  orderedLeaks,
  idbGet,
  includedPhotoKeys = null,
  photoReadCache,
) {
  const candidates = [];

  for (const [leakIndex, leak] of orderedLeaks.entries()) {
    const leakId = leak.leak_id ?? leak.index ?? leakIndex + 1;
    const records = getMonitoringRecords(leak);

    for (const [recordIndex, record] of records.entries()) {
      const mapKey = `monitoring:${leakIndex}:${recordIndex}`;
      if (includedPhotoKeys && !includedPhotoKeys.has(mapKey)) continue;
      if (!record.photo) continue;

      candidates.push({
        path: record.photo,
        mapKey,
        fileNameBase: `photos/${leakId}/monitoring/${leakId}_monitoring_${recordIndex + 1}`,
      });
    }
  }

  return resolvePhotoCandidates(candidates, idbGet, photoReadCache);
}

async function buildPhotoEntries(
  orderedLeaks,
  idbGet,
  monitoringExportMode,
  photoReadCache,
) {
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
    buildLeakPhotoEntries(orderedLeaks, idbGet, photoReadCache),
    buildMonitoringPhotoEntries(
      orderedLeaks,
      idbGet,
      includedMonitoringPhotoKeys,
      photoReadCache,
    ),
  ]);

  return [...leakPhotos, ...monitoringPhotos];
}
function buildPhotoMap(photoEntries) {
  return Object.fromEntries(
    photoEntries.map((entry) => [entry.mapKey, entry.photoFileName]),
  );
}

function buildPortableLeaks(leaks, photoMap) {
  return leaks.map((leak, leakIndex) => {
    const copy = { ...leak };
    for (const key of PHOTO_KEYS) {
      const photoFileName = photoMap[`${leakIndex}:${key}`];
      if (photoFileName) copy[key] = `zip:${photoFileName}`;
    }

    if (Array.isArray(copy.monitoringRecords)) {
      copy.monitoringRecords = copy.monitoringRecords.map(
        (record, recordIndex) => {
          const photoFileName =
            photoMap[`monitoring:${leakIndex}:${recordIndex}`];
          return photoFileName
            ? { ...record, photo: `zip:${photoFileName}` }
            : record;
        },
      );
    }

    return copy;
  });
}

function addBackupSheet(workbook, archivePayload, lang) {
  if (!archivePayload) return;

  const sheet = workbook.addWorksheet(BACKUP_SHEET_NAME);
  sheet.addRow([
    BACKUP_MARKER,
    BACKUP_SCHEMA_VERSION,
    lang === "ru" ? "Резервная копия проекта" : "Project backup",
  ]);
  sheet.addRow([
    "Chunk",
    "Payload",
    lang === "ru"
      ? "Сводка предназначена для просмотра. Для восстановления используются скрытые служебные столбцы."
      : "The summary is for reference. Restore data is stored in hidden system columns.",
  ]);

  const serialized = JSON.stringify(archivePayload);
  let chunkCount = 0;
  for (let offset = 0, index = 1; offset < serialized.length; index += 1) {
    sheet.addRow([index, serialized.slice(offset, offset + BACKUP_CHUNK_SIZE)]);
    offset += BACKUP_CHUNK_SIZE;
    chunkCount += 1;
  }

  const leaks = Array.isArray(archivePayload.leaks) ? archivePayload.leaks : [];
  const monitoringCount = leaks.reduce(
    (total, leak) =>
      total +
      (Array.isArray(leak?.monitoringRecords)
        ? leak.monitoringRecords.length
        : 0),
    0,
  );
  const historyCount = leaks.reduce(
    (total, leak) =>
      total + (Array.isArray(leak?.history) ? leak.history.length : 0),
    0,
  );
  const typeLabels =
    lang === "ru"
      ? {
          upstream: "Добыча (Upstream)",
          midstream: "Транспортировка (Midstream)",
          downstream: "Переработка (Downstream)",
        }
      : {
          upstream: "Upstream",
          midstream: "Midstream",
          downstream: "Downstream",
        };
  const exportedAt = parseTimestamp(archivePayload.exportedAt);
  const round = archivePayload.monitoringRound;
  const currentRoundCheckedFromRecords = round
    ? leaks.filter((leak) =>
        getMonitoringRecords(leak).some((record) =>
          record.roundId
            ? record.roundId === round.id
            : Number(record.roundNumber) === Number(round.number),
        ),
      ).length
    : null;
  const summaryTotal = Number(round?.summary?.total);
  const summaryChecked = Number(round?.summary?.checked);
  const currentRoundTotal = round
    ? Number.isFinite(summaryTotal)
      ? summaryTotal
      : leaks.length
    : null;
  const currentRoundChecked = round
    ? Number.isFinite(summaryChecked)
      ? summaryChecked
      : currentRoundCheckedFromRecords
    : null;
  const currentRoundRemaining = round
    ? Math.max(0, currentRoundTotal - currentRoundChecked)
    : null;
  const emptyValue = "—";
  const summaryRows =
    lang === "ru"
      ? [
          ["Проект", archivePayload.project?.name || emptyValue, "@"],
          [
            "Тип проекта",
            typeLabels[archivePayload.project?.type] ||
              archivePayload.project?.type ||
              emptyValue,
            "@",
          ],
          [
            "Экспортировано",
            exportedAt || emptyValue,
            exportedAt ? EXCEL_DATE_TIME_FORMAT : "@",
          ],
          ["Утечек", leaks.length, INTEGER_FORMAT],
          ["Проверок мониторинга", monitoringCount, INTEGER_FORMAT],
          ["Записей истории", historyCount, INTEGER_FORMAT],
          [
            "Текущий обход",
            round?.number ? Number(round.number) : emptyValue,
            round?.number ? '"№ "0' : "@",
          ],
          [
            "Проверено в текущем обходе",
            currentRoundChecked ?? emptyValue,
            currentRoundChecked == null ? "@" : INTEGER_FORMAT,
          ],
          [
            "Всего в текущем обходе",
            currentRoundTotal ?? emptyValue,
            currentRoundTotal == null ? "@" : INTEGER_FORMAT,
          ],
          [
            "Осталось проверить",
            currentRoundRemaining ?? emptyValue,
            currentRoundRemaining == null ? "@" : INTEGER_FORMAT,
          ],
          ["Версия резервной копии", BACKUP_SCHEMA_VERSION, INTEGER_FORMAT],
        ]
      : [
          ["Project", archivePayload.project?.name || emptyValue, "@"],
          [
            "Project type",
            typeLabels[archivePayload.project?.type] ||
              archivePayload.project?.type ||
              emptyValue,
            "@",
          ],
          [
            "Exported at",
            exportedAt || emptyValue,
            exportedAt ? EXCEL_DATE_TIME_FORMAT : "@",
          ],
          ["Leaks", leaks.length, INTEGER_FORMAT],
          ["Monitoring checks", monitoringCount, INTEGER_FORMAT],
          ["History records", historyCount, INTEGER_FORMAT],
          [
            "Current round",
            round?.number ? Number(round.number) : emptyValue,
            round?.number ? '"No. "0' : "@",
          ],
          [
            "Checked in current round",
            currentRoundChecked ?? emptyValue,
            currentRoundChecked == null ? "@" : INTEGER_FORMAT,
          ],
          [
            "Total in current round",
            currentRoundTotal ?? emptyValue,
            currentRoundTotal == null ? "@" : INTEGER_FORMAT,
          ],
          [
            "Remaining to check",
            currentRoundRemaining ?? emptyValue,
            currentRoundRemaining == null ? "@" : INTEGER_FORMAT,
          ],
          ["Backup schema", BACKUP_SCHEMA_VERSION, INTEGER_FORMAT],
        ];

  const summaryHeaderRow = 4;
  const requiredRows = summaryHeaderRow + summaryRows.length;
  for (
    let rowNumber = 2 + chunkCount;
    rowNumber < requiredRows;
    rowNumber += 1
  ) {
    sheet.addRow([]);
  }

  sheet.getRow(summaryHeaderRow).getCell(3).value =
    lang === "ru" ? "Параметр" : "Field";
  sheet.getRow(summaryHeaderRow).getCell(4).value =
    lang === "ru" ? "Значение" : "Value";

  summaryRows.forEach(([label, value, numberFormat], index) => {
    const row = sheet.getRow(summaryHeaderRow + index + 1);
    row.getCell(3).value = label;
    row.getCell(4).value = value;
    row.getCell(3).numFmt = "@";
    row.getCell(4).numFmt = numberFormat;
    row.getCell(3).font = { bold: true, color: { argb: "FF3F3F3F" } };
    if (index % 2 === 0) {
      row.getCell(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3EDF8" },
      };
      row.getCell(4).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3EDF8" },
      };
    }
  });

  const summaryHeader = sheet.getRow(summaryHeaderRow);
  summaryHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  summaryHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF8064A2" },
  };
  summaryHeader.alignment = { vertical: "middle", horizontal: "center" };
  summaryHeader.height = 26;

  sheet.views = [{ state: "frozen", ySplit: summaryHeaderRow }];
  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 100;
  sheet.getColumn(1).hidden = true;
  sheet.getColumn(2).hidden = true;
  sheet.getColumn(3).width = 30;
  sheet.getColumn(4).width = 52;
  sheet.getRow(2).height = 34;
  sheet.getRow(2).alignment = { vertical: "middle", wrapText: true };
  styleHeaderRow(sheet, "FF7030A0");
}
function toExcelTableName(name) {
  return String(name)
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^[^A-Za-z_]/, "_")
    .slice(0, 255);
}

function getColumnWidth(header, key, rows, { isPhoto = false } = {}) {
  if (isPhoto) return 18;

  const preferred = {
    index: 8,
    leak_id: 12,
    video_id: 12,
    status: 16,
    date: 14,
    time: 12,
    resolvedAt: 14,
    pressure: 12,
    temperature: 14,
    temperature_K: 14,
    leak_speed: 16,
    leak_speed_kg_h: 16,
    lat: 14,
    lng: 14,
    detectedBy: 20,
    monitoredBy: 20,
    roundNumber: 10,
    result: 22,
    materials_equipment: 42,
    leak_description: 42,
    technological_solution: 42,
    note: 34,
    comment: 42,
  };

  if (preferred[key]) return preferred[key];

  return Math.min(
    Math.max(
      header.length,
      ...rows.map((row) => String(row[key] ?? "").length),
    ) + 2,
    36,
  );
}

function addStructuredTable(sheet, { name, headers, rows, theme }) {
  const tableRows = rows.map((row) => [...row]);

  if (typeof sheet.addTable === "function") {
    sheet.addTable({
      name: toExcelTableName(name),
      ref: "A1",
      headerRow: true,
      totalsRow: false,
      style: {
        theme,
        showRowStripes: true,
      },
      columns: headers.map((header) => ({
        name: header,
        filterButton: true,
      })),
      rows: tableRows,
    });
  } else {
    sheet.addRow(headers);
    tableRows.forEach((row) => sheet.addRow(row));
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function normalizeExcelCellValue(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : "";
  }

  return value ?? "";
}

function parseTimestamp(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const localized = text.match(
    /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (localized) {
    const [, day, month, year, hour = 0, minute = 0, second = 0] = localized;
    const date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ),
    );
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const numeric = Number(text);
  const date = new Date(Number.isFinite(numeric) ? numeric : text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toExcelTimeValue(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return (
      (value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds()) /
      86_400
    );
  }

  const match = String(value ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return normalizeExcelCellValue(value);
  const [, hours, minutes, seconds = 0] = match;
  return (
    (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) / 86_400
  );
}

function getExcelColumnFormat(key) {
  if (DATE_KEYS.has(key)) return EXCEL_DATE_FORMAT;
  if (TIME_KEYS.has(key)) return EXCEL_TIME_FORMAT;
  if (key === "leak_id") return "General";
  if (INTEGER_KEYS.has(key)) return INTEGER_FORMAT;
  if (PERCENT_KEYS.has(key)) return PERCENT_FORMAT;
  if (COORDINATE_KEYS.has(key)) return COORDINATE_FORMAT;
  if (DECIMAL_KEYS.has(key)) return DECIMAL_FORMAT;
  return "@";
}

function toExcelCellValue(key, value) {
  if (value == null || value === "") return "";
  if (DATE_KEYS.has(key))
    return parseTimestamp(value) ?? normalizeExcelCellValue(value);
  if (TIME_KEYS.has(key)) return toExcelTimeValue(value);
  if (
    INTEGER_KEYS.has(key) ||
    PERCENT_KEYS.has(key) ||
    COORDINATE_KEYS.has(key) ||
    DECIMAL_KEYS.has(key)
  ) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return normalizeExcelCellValue(value);
    return WHOLE_PERCENT_KEYS.has(key) ? numeric / 100 : numeric;
  }
  if (TEXT_IDENTIFIER_KEYS.has(key)) return String(value);
  if (key === "leak_id") {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : "";
    }
    const text = String(value).trim();
    if (
      /^(?:0|[1-9]\d*)$/.test(text) &&
      text.length <= 15 &&
      Number.isSafeInteger(Number(text))
    ) {
      return Number(text);
    }
    return text;
  }
  return normalizeExcelCellValue(value);
}

function applyColumnFormats(sheet, keys) {
  keys.forEach((key, index) => {
    sheet.getColumn(index + 1).numFmt = getExcelColumnFormat(key);
  });
}

function formatLeakTime(leak, row) {
  if (row?.time != null && String(row.time).trim() !== "") {
    return String(row.time).trim();
  }

  const date = [
    leak?.createdAt,
    leak?.created_at,
    row?.createdAt,
    row?.created_at,
    leak?.date,
    row?.date,
  ]
    .map(parseTimestamp)
    .find(Boolean);
  if (!date) return "";

  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function styleHeaderRow(sheet, fillColor) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: fillColor },
  };
  headerRow.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  headerRow.height = 34;
}

async function styleBodyRows(sheet, rowCount) {
  for (let rowIndex = 2; rowIndex <= rowCount + 1; rowIndex += 1) {
    if (rowIndex > 2 && rowIndex % EXPORT_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }
    const row = sheet.getRow(rowIndex);
    row.alignment = { vertical: "middle", wrapText: true };
  }
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

async function buildHistorySheet(workbook, orderedLeaks, lang) {
  const fallbackUser = lang === "ru" ? "Не указан" : "Unknown";
  const getHistoryUser = (entry, leak) =>
    entry.user ??
    entry.monitoredBy ??
    entry.detectedBy ??
    leak.detectedBy ??
    leak.monitoredBy ??
    fallbackUser;

  const rows = orderedLeaks.flatMap((leak, leakIndex) =>
    (Array.isArray(leak.history) ? leak.history : []).map((entry) => ({
      index: leak.index ?? leakIndex + 1,
      leak_id: leak.leak_id ?? "",
      date: parseTimestamp(entry.date) ?? "",
      time: parseTimestamp(entry.date) ?? "",
      action: entry.action ?? "",
      user: getHistoryUser(entry, leak),
      text: entry.text ?? "",
      to: entry.to ?? "",
      changes: Array.isArray(entry.changes)
        ? JSON.stringify(entry.changes)
        : "",
    })),
  );

  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(
    lang === "ru" ? "История" : "Leak History",
  );
  const headers =
    lang === "ru"
      ? [
          "№",
          "Бирка",
          "Дата",
          "Время",
          "Действие",
          "Пользователь",
          "Текст",
          "Статус",
          "Изменения JSON",
        ]
      : [
          "No.",
          "Tag",
          "Date",
          "Time",
          "Action",
          "User",
          "Text",
          "Status",
          "Changes JSON",
        ];
  const keys = [
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

  const tableRows = rows.map((row) =>
    keys.map((key) => toExcelCellValue(key, row[key])),
  );

  addStructuredTable(sheet, {
    name: "History",
    headers,
    rows: tableRows,
    theme: "TableStyleMedium9",
  });
  styleHeaderRow(sheet, "FF8064A2");
  await styleBodyRows(sheet, rows.length);

  applyColumnFormats(sheet, keys);

  keys.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
    );
  });
}

function buildMonitoringRoundLookup(orderedLeaks) {
  const rounds = new Map();

  orderedLeaks.forEach((leak) => {
    getMonitoringRecords(leak).forEach((record) => {
      if (!record.roundId || Number(record.roundNumber) > 0) return;

      const time = Date.parse(record.date);
      const current = rounds.get(record.roundId);
      if (!current || time < current.firstTime) {
        rounds.set(record.roundId, {
          firstTime: Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time,
        });
      }
    });
  });

  return new Map(
    [...rounds.entries()]
      .sort((left, right) => left[1].firstTime - right[1].firstTime)
      .map(([roundId], index) => [roundId, index + 1]),
  );
}

function getMonitoringExportRows(
  orderedLeaks,
  roundLookup,
  monitoringExportMode = EXCEL_MONITORING_EXPORT_MODE.FULL,
) {
  const rows = [];

  orderedLeaks.forEach((leak, leakIndex) => {
    getMonitoringRecords(leak).forEach((record, recordIndex) => {
      const roundNumber =
        Number(record.roundNumber) > 0
          ? Number(record.roundNumber)
          : (roundLookup.get(record.roundId) ?? recordIndex + 1);
      const roundKey = record.roundId ?? `legacy-${roundNumber}`;
      rows.push({
        index: leak.index ?? leakIndex + 1,
        leak_id: leak.leak_id ?? "",
        roundNumber,
        dateRaw: record.date,
        monitoredBy: record.monitoredBy ?? "",
        result: record.result,
        materials_equipment: record.materials_equipment ?? "",
        comment: record.comment ?? "",
        photo: record.photo ?? "",
        photoMapKey: `monitoring:${leakIndex}:${recordIndex}`,
        exportGroupKey: `${leak.id ?? leak.leak_id ?? leakIndex}:${roundKey}`,
      });
    });
  });

  const selectedRows =
    monitoringExportMode === EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND
      ? [
          ...rows
            .reduce((latestByGroup, row) => {
              const current = latestByGroup.get(row.exportGroupKey);
              const currentTime = Date.parse(current?.dateRaw ?? "");
              const rowTime = Date.parse(row.dateRaw);
              if (
                !current ||
                (Number.isNaN(currentTime) ? 0 : currentTime) <=
                  (Number.isNaN(rowTime) ? 0 : rowTime)
              ) {
                latestByGroup.set(row.exportGroupKey, row);
              }
              return latestByGroup;
            }, new Map())
            .values(),
        ]
      : rows;

  return selectedRows.sort((left, right) => {
    if (left.roundNumber !== right.roundNumber) {
      return left.roundNumber - right.roundNumber;
    }

    if ((left.index ?? 0) !== (right.index ?? 0)) {
      return (left.index ?? 0) - (right.index ?? 0);
    }

    const leftTime = Date.parse(left.dateRaw);
    const rightTime = Date.parse(right.dateRaw);
    return (
      (Number.isNaN(leftTime) ? 0 : leftTime) -
      (Number.isNaN(rightTime) ? 0 : rightTime)
    );
  });
}

async function buildMonitoringSheet(
  workbook,
  orderedLeaks,
  lang,
  photoMap,
  monitoringExportMode,
) {
  const roundLookup = buildMonitoringRoundLookup(orderedLeaks);
  const rows = getMonitoringExportRows(
    orderedLeaks,
    roundLookup,
    monitoringExportMode,
  ).map((row) => ({
    ...row,
    date: parseTimestamp(row.dateRaw) ?? "",
    time: parseTimestamp(row.dateRaw) ?? "",
    result: getMonitoringAnswerLabel(row.result, lang),
  }));

  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(
    lang === "ru" ? "Мониторинг" : "Monitoring",
  );
  const headers =
    lang === "ru"
      ? [
          "№",
          "Бирка",
          "Обход",
          "Дата мониторинга",
          "Время мониторинга",
          "Кто мониторил",
          "Утечка есть",
          "МТР",
          "Комментарий",
        ]
      : [
          "No.",
          "Tag",
          "Round",
          "Monitoring date",
          "Monitoring time",
          "Monitored by",
          "Leak present",
          "Materials",
          "Comment",
        ];
  const keys = [
    "index",
    "leak_id",
    "roundNumber",
    "date",
    "time",
    "monitoredBy",
    "result",
    "materials_equipment",
    "comment",
  ];

  headers.push(lang === "ru" ? "Фото мониторинга" : "Monitoring photo");
  keys.push("photo");

  const tableRows = rows.map((row) =>
    keys.map((key) => {
      if (key === "photo" && photoMap[row.photoMapKey]) return "";
      return toExcelCellValue(key, row[key]);
    }),
  );

  addStructuredTable(sheet, {
    name: "Monitoring",
    headers,
    rows: tableRows,
    theme: MONITORING_TABLE_THEME,
  });
  styleHeaderRow(sheet, "FF548235");
  await styleBodyRows(sheet, rows.length);

  for (const [rowIndex, row] of rows.entries()) {
    if (rowIndex > 0 && rowIndex % EXPORT_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }

    const photoColumnIndex = keys.indexOf("photo") + 1;
    const photoFile = photoMap[row.photoMapKey];
    const photoCell = sheet.getRow(rowIndex + 2).getCell(photoColumnIndex);

    if (photoFile) {
      photoCell.value = {
        text: lang === "ru" ? "Открыть фото" : "Open photo",
        hyperlink: photoFile,
      };
      photoCell.font = { color: { argb: "FF1155CC" }, underline: true };
    } else {
      photoCell.value = row.photo
        ? lang === "ru"
          ? "Есть (файл не найден)"
          : "Present (file missing)"
        : "";
    }
  }

  applyColumnFormats(sheet, keys);

  keys.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
      {
        isPhoto: key === "photo",
      },
    );
  });
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
    URL.revokeObjectURL(url);

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
  const photoEntries = [
    ...new Map(
      [...reportPhotoEntries, ...backupPhotoEntries].map((entry) => [
        entry.photoFileName,
        entry,
      ]),
    ).values(),
  ];
  phaseMetrics.photosMs = performance.now() - photosStartedAt;
  const photoMap = buildPhotoMap(reportPhotoEntries);
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
  zip.file(`${fileName}.xlsx`, xlsxBuffer);

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
    `${fileName}.zip`,
    outputFolder,
    lang,
    lang === "ru"
      ? `Excel-архив проекта экспортирован (${fileName}.zip)`
      : `Excel project archive exported (${fileName}.zip)`,
  );
  return { ...result, metrics: phaseMetrics };
}

export const exportToExcelZip = exportToExcelFile;
