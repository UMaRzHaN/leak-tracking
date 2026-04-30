// Dynamic imports for heavy export libraries - loaded on-demand only
const getExcelJS = () => import("exceljs");
const getJSZip = () => import("jszip");

import { isNative } from "../../utils/platform";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { getPhotoSrc } from "../photoService";
import { blobToDataUri } from "../../utils/photoConversion";

async function resolvePhotoSrc(path, idbGet) {
  if (!path) return null;
  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    const raw = idbGet ? await idbGet(id) : null;
    if (!raw) return null;
    // raw is a Blob (new storage) or a data URI string (legacy storage)
    return raw instanceof Blob ? blobToDataUri(raw) : raw;
  }
  return getPhotoSrc(path);
}

/**
 * Exports leaks to a ZIP archive containing:
 *   - утечки.xlsx  — table with clickable links in photo columns
 *   - photos/      — folder with actual photo files
 *
 * @param {object[]} rawLeaks   — original leak objects (with raw photo paths)
 * @param {object[]} rows       — display-ready rows (status labels etc.)
 * @param {string[]} headers    — column header labels
 * @param {string[]} keysOrder  — field keys in display order
 * @param {string}   fileName   — output zip name (without extension)
 * @param {Function} idbGet    — (id: string) => Promise<string|null>  for web IndexedDB photos
 */
export async function exportToExcelZip(
  rawLeaks,
  rows,
  headers,
  keysOrder,
  fileName = "утечки",
  idbGet = null,
  projectFolderName = null,
) {
  const PHOTO_KEYS = ["photo", "photo_after"];
  const photoColIndexes = PHOTO_KEYS.map((k) => keysOrder.indexOf(k)).filter(
    (i) => i !== -1,
  );

  // Sort oldest first (ascending by id) and keep rows in sync
  const paired = rawLeaks.map((leak, i) => ({ leak, row: rows[i] }));
  paired.sort((a, b) => (a.leak.id ?? 0) - (b.leak.id ?? 0));
  const orderedLeaks = paired.map((p) => p.leak);
  const orderedRows  = paired.map((p) => p.row);

  // Resolve all photos: { leakIndex, key, fileName, base64 }
  const photoEntries = [];
  await Promise.all(
    orderedLeaks.map(async (leak, li) => {
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
        const leakId = leak.leak_id ?? leak.index ?? (li + 1);
        const photoFileName = `photos/${leakId}/${leakId}${suffix}.${ext}`;

        photoEntries.push({ leakIndex: li, key, photoFileName, base64 });
      }
    }),
  );

  // Build lookup: leakIndex+key → relative file path
  const photoMap = {};
  for (const e of photoEntries) {
    photoMap[`${e.leakIndex}:${e.key}`] = e.photoFileName;
  }

  // Build xlsx with ExcelJS - dynamic import to avoid bundling
  const ExcelJS = (await getExcelJS()).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Утечки");

  // Header row
  sheet.addRow(headers);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9E1F2" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 30;

  // Data rows
  orderedRows.forEach((row, li) => {
    const values = keysOrder.map((key, ci) => {
      if (PHOTO_KEYS.includes(key)) {
        const mapKey = `${li}:${key}`;
        if (photoMap[mapKey]) return null; // will be set as hyperlink below
        return row[key] ?? "";
      }
      return row[key] ?? "";
    });
    const excelRow = sheet.addRow(values);
    excelRow.alignment = { vertical: "middle", wrapText: true };

    // Set hyperlinks for photo columns
    for (const ci of photoColIndexes) {
      const key = keysOrder[ci];
      const mapKey = `${li}:${key}`;
      const photoFile = photoMap[mapKey];
      const cell = excelRow.getCell(ci + 1);
      if (photoFile) {
        cell.value = {
          text: "Открыть фото",
          hyperlink: photoFile,
        };
        cell.font = { color: { argb: "FF1155CC" }, underline: true };
      } else {
        cell.value = row[key] ? "Есть (нет файла)" : "";
      }
    }
  });

  // Column widths
  headers.forEach((h, i) => {
    const key = keysOrder[i];
    const isPhoto = PHOTO_KEYS.includes(key);
    const maxLen = isPhoto
      ? 14
      : Math.min(
          Math.max(h.length, ...orderedRows.map((r) => String(r[key] ?? "").length)) + 2,
          60,
        );
    sheet.getColumn(i + 1).width = maxLen;
  });

  // Generate xlsx buffer
  const xlsxBuffer = await workbook.xlsx.writeBuffer();

  // Build ZIP - dynamic import to avoid bundling
  const JSZip = (await getJSZip()).default;
  const zip = new JSZip();
  zip.file(`${fileName}.xlsx`, xlsxBuffer);
  for (const e of photoEntries) {
    zip.file(e.photoFileName, e.base64, { base64: true });
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  return downloadBlob(zipBlob, `${fileName}.zip`, projectFolderName);
}

async function downloadBlob(blob, fileName, projectFolderName = null) {
  if (!isNative) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return {
      ok: true,
      message: `XLSX с фотографиями экспортирован (${fileName})`,
    };
  }

  // Native: convert to base64 via FileReader (safe for large files)
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const outputFolder = projectFolderName
    ? `${projectFolderName}/export/xlsx`
    : "export/xlsx";

  await Filesystem.mkdir({
    path: outputFolder,
    directory: Directory.Documents,
    recursive: true,
  }).catch(() => {});

  await Filesystem.writeFile({
    path: `${outputFolder}/${fileName}`,
    data: base64,
    directory: Directory.Documents,
  });

  return {
    ok: true,
    path: `${outputFolder}/${fileName}`,
    message: `Сохранено в Документы/${outputFolder}/${fileName}`,
  };
}
