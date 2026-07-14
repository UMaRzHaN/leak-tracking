const getExcelJS = () => import("exceljs");
const getJSZip = () => import("jszip");

import { isNative } from "@/utils/platform";
import { getPhotoSrc } from "@/hooks/photoService";
import { blobToDataUri } from "@/utils/photoConversion";
import {
  formatMonitoringDate,
  getMonitoringRecords,
  getMonitoringResultLabel,
} from "@/utils/monitoring";
import {
  EXCEL_MONITORING_EXPORT_MODE,
  normalizeExcelMonitoringExportMode,
} from "@/utils/excelExportMode";

const PHOTO_KEYS = ["photo", "photo_after", "photo_repair"];
const DEFAULT_EXPORT_DIR = "export/xlsx";
const EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const LEAKS_TABLE_THEME = "TableStyleMedium2";
const MONITORING_TABLE_THEME = "TableStyleMedium4";
const EXPORT_YIELD_EVERY = 40;

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

async function buildLeakPhotoEntries(orderedLeaks, idbGet) {
  const photoEntries = [];

  for (const [leakIndex, leak] of orderedLeaks.entries()) {
    if (leakIndex > 0 && leakIndex % EXPORT_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }

    for (const key of PHOTO_KEYS) {
      const path = leak[key];
      if (!path) continue;

      const src = await resolvePhotoSrc(path, idbGet);
      if (!src || !src.startsWith("data:")) continue;

      const match = src.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) continue;

      const ext = match[1].split("/")[1] || "jpg";
      const base64 = match[2];
      const suffix =
        key === "photo_after"
          ? "_after"
          : key === "photo_repair"
            ? "_repair"
            : "";
      const leakId = leak.leak_id ?? leak.index ?? leakIndex + 1;
      const photoFileName = `photos/${leakId}/${leakId}${suffix}.${ext}`;

      photoEntries.push({
        mapKey: `${leakIndex}:${key}`,
        photoFileName,
        base64,
      });
    }
  }

  return photoEntries;
}

async function buildMonitoringPhotoEntries(
  orderedLeaks,
  idbGet,
  includedPhotoKeys = null,
) {
  const photoEntries = [];

  for (const [leakIndex, leak] of orderedLeaks.entries()) {
    if (leakIndex > 0 && leakIndex % EXPORT_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }

    const leakId = leak.leak_id ?? leak.index ?? leakIndex + 1;
    const records = getMonitoringRecords(leak);

    for (const [recordIndex, record] of records.entries()) {
      const mapKey = `monitoring:${leakIndex}:${recordIndex}`;
      if (includedPhotoKeys && !includedPhotoKeys.has(mapKey)) continue;
      const path = record.photo;
      if (!path) continue;

      const src = await resolvePhotoSrc(path, idbGet);
      if (!src || !src.startsWith("data:")) continue;

      const match = src.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) continue;

      const ext = match[1].split("/")[1] || "jpg";
      const base64 = match[2];
      const photoFileName = `photos/${leakId}/monitoring/${leakId}_monitoring_${recordIndex + 1}.${ext}`;

      photoEntries.push({
        mapKey,
        photoFileName,
        base64,
      });
    }
  }

  return photoEntries;
}

async function buildPhotoEntries(orderedLeaks, idbGet, monitoringExportMode) {
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
    buildLeakPhotoEntries(orderedLeaks, idbGet),
    buildMonitoringPhotoEntries(
      orderedLeaks,
      idbGet,
      includedMonitoringPhotoKeys,
    ),
  ]);

  return [...leakPhotos, ...monitoringPhotos];
}

function buildPhotoMap(photoEntries) {
  return Object.fromEntries(
    photoEntries.map((entry) => [entry.mapKey, entry.photoFileName]),
  );
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

      return row[key] ?? "";
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

  return workbook;
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
    date: formatMonitoringDate(row.dateRaw, lang),
    result: getMonitoringResultLabel(row.result, lang),
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
          "Кто мониторил",
          "Результат",
          "МТР",
          "Комментарий",
        ]
      : [
          "No.",
          "Tag",
          "Round",
          "Monitoring date",
          "Monitored by",
          "Result",
          "Materials",
          "Comment",
        ];
  const keys = [
    "index",
    "leak_id",
    "roundNumber",
    "date",
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
      return row[key] ?? "";
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
  const paired = rawLeaks.map((leak, index) => ({ leak, row: rows[index] }));
  paired.sort((left, right) => (left.leak.id ?? 0) - (right.leak.id ?? 0));

  const orderedLeaks = paired.map((pair) => pair.leak);
  const orderedRows = paired.map((pair) => pair.row);
  const monitoringExportMode = normalizeExcelMonitoringExportMode(
    options.monitoringExportMode,
  );
  const photoEntries = await buildPhotoEntries(
    orderedLeaks,
    idbGet,
    monitoringExportMode,
  );
  const photoMap = buildPhotoMap(photoEntries);
  const outputFolder = getExportFolder(projectFolderName);

  const ExcelJS = (await getExcelJS()).default;
  const workbook = await buildWorkbook({
    orderedLeaks,
    orderedRows,
    headers,
    keysOrder,
    photoMap,
    lang,
    ExcelJS,
    monitoringExportMode,
  });

  await yieldToMainThread();
  const xlsxBuffer = await workbook.xlsx.writeBuffer();
  const xlsxBlob = new Blob([xlsxBuffer], { type: EXCEL_MIME });

  if (photoEntries.length === 0) {
    return downloadBlob(
      xlsxBlob,
      `${fileName}.xlsx`,
      outputFolder,
      lang,
      lang === "ru"
        ? `XLSX экспортирован (${fileName}.xlsx)`
        : `XLSX exported (${fileName}.xlsx)`,
    );
  }

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
  return downloadBlob(
    zipBlob,
    `${fileName}.zip`,
    outputFolder,
    lang,
    lang === "ru"
      ? `XLSX с фотографиями экспортирован (${fileName}.zip)`
      : `XLSX with photos exported (${fileName}.zip)`,
  );
}

export const exportToExcelZip = exportToExcelFile;
