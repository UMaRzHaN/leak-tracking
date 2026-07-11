const getExcelJS = () => import("exceljs");
const getJSZip = () => import("jszip");

import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "@/utils/platform";
import { getPhotoSrc } from "@/hooks/photoService";
import { blobToDataUri } from "@/utils/photoConversion";
import { logger } from "@/utils/logger";

const PHOTO_KEYS = ["photo", "photo_after"];
const DEFAULT_EXPORT_DIR = "export/xlsx";
const EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

async function buildPhotoEntries(orderedLeaks, idbGet) {
  const photoEntries = [];

  await Promise.all(
    orderedLeaks.map(async (leak, leakIndex) => {
      for (const key of PHOTO_KEYS) {
        const path = leak[key];
        if (!path) continue;

        const src = await resolvePhotoSrc(path, idbGet);
        if (!src || !src.startsWith("data:")) continue;

        const match = src.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) continue;

        const ext = match[1].split("/")[1] || "jpg";
        const base64 = match[2];
        const suffix = key === "photo_after" ? "_after" : "";
        const leakId = leak.leak_id ?? leak.index ?? leakIndex + 1;
        const photoFileName = `photos/${leakId}/${leakId}${suffix}.${ext}`;

        photoEntries.push({ leakIndex, key, photoFileName, base64 });
      }
    }),
  );

  return photoEntries;
}

function buildPhotoMap(photoEntries) {
  return Object.fromEntries(
    photoEntries.map((entry) => [
      `${entry.leakIndex}:${entry.key}`,
      entry.photoFileName,
    ]),
  );
}

function buildWorkbook({
  orderedRows,
  headers,
  keysOrder,
  photoMap,
  lang,
  ExcelJS,
}) {
  const photoColumnIndexes = PHOTO_KEYS.map((key) =>
    keysOrder.indexOf(key),
  ).filter((index) => index !== -1);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(lang === "ru" ? "Утечки" : "Leaks");

  sheet.addRow(headers);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9E1F2" },
  };
  headerRow.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  headerRow.height = 30;

  orderedRows.forEach((row, leakIndex) => {
    const values = keysOrder.map((key) => {
      if (PHOTO_KEYS.includes(key) && photoMap[`${leakIndex}:${key}`]) {
        return null;
      }

      return row[key] ?? "";
    });

    const excelRow = sheet.addRow(values);
    excelRow.alignment = { vertical: "middle", wrapText: true };

    for (const columnIndex of photoColumnIndexes) {
      const key = keysOrder[columnIndex];
      const mapKey = `${leakIndex}:${key}`;
      const photoFile = photoMap[mapKey];
      const cell = excelRow.getCell(columnIndex + 1);

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
  });

  headers.forEach((header, index) => {
    const key = keysOrder[index];
    const isPhoto = PHOTO_KEYS.includes(key);
    const maxLen = isPhoto
      ? 14
      : Math.min(
          Math.max(
            header.length,
            ...orderedRows.map((row) => String(row[key] ?? "").length),
          ) + 2,
          60,
        );
    sheet.getColumn(index + 1).width = maxLen;
  });

  return workbook;
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

  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  await Filesystem.mkdir({
    path: outputFolder,
    directory: Directory.Documents,
    recursive: true,
  }).catch(() => {});

  try {
    await Filesystem.deleteFile({
      path: `${outputFolder}/${fileName}`,
      directory: Directory.Documents,
    });
  } catch (error) {
    logger.log("Old export file not found:", error?.message);
  }

  await Filesystem.writeFile({
    path: `${outputFolder}/${fileName}`,
    data: base64,
    directory: Directory.Documents,
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
) {
  const paired = rawLeaks.map((leak, index) => ({ leak, row: rows[index] }));
  paired.sort((left, right) => (left.leak.id ?? 0) - (right.leak.id ?? 0));

  const orderedLeaks = paired.map((pair) => pair.leak);
  const orderedRows = paired.map((pair) => pair.row);
  const photoEntries = await buildPhotoEntries(orderedLeaks, idbGet);
  const photoMap = buildPhotoMap(photoEntries);
  const outputFolder = getExportFolder(projectFolderName);

  const ExcelJS = (await getExcelJS()).default;
  const workbook = buildWorkbook({
    orderedRows,
    headers,
    keysOrder,
    photoMap,
    lang,
    ExcelJS,
  });

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

  for (const entry of photoEntries) {
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
