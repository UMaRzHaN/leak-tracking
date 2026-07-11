const getExcelJS = () => import("exceljs");
const getJSZip = () => import("jszip");

import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "@/utils/platform";
import { getPhotoSrc } from "@/hooks/photoService";
import { blobToDataUri } from "@/utils/photoConversion";

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

export async function exportToExcelZip(
  rawLeaks,
  rows,
  headers,
  keysOrder,
  fileName = "утечки",
  idbGet = null,
  projectFolderName = null,
  lang = "ru",
) {
  const photoKeys = ["photo", "photo_after"];
  const photoColumnIndexes = photoKeys
    .map((key) => keysOrder.indexOf(key))
    .filter((index) => index !== -1);

  const paired = rawLeaks.map((leak, index) => ({ leak, row: rows[index] }));
  paired.sort((left, right) => (left.leak.id ?? 0) - (right.leak.id ?? 0));

  const orderedLeaks = paired.map((pair) => pair.leak);
  const orderedRows = paired.map((pair) => pair.row);

  const photoEntries = [];
  await Promise.all(
    orderedLeaks.map(async (leak, leakIndex) => {
      for (const key of photoKeys) {
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

  const photoMap = {};
  for (const entry of photoEntries) {
    photoMap[`${entry.leakIndex}:${entry.key}`] = entry.photoFileName;
  }

  const ExcelJS = (await getExcelJS()).default;
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
      if (photoKeys.includes(key)) {
        const mapKey = `${leakIndex}:${key}`;
        if (photoMap[mapKey]) return null;
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
            ? "Есть (нет файла)"
            : "Present (file missing)"
          : "";
      }
    }
  });

  headers.forEach((header, index) => {
    const key = keysOrder[index];
    const isPhoto = photoKeys.includes(key);
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

  const xlsxBuffer = await workbook.xlsx.writeBuffer();
  const JSZip = (await getJSZip()).default;
  const zip = new JSZip();
  zip.file(`${fileName}.xlsx`, xlsxBuffer);

  for (const entry of photoEntries) {
    zip.file(entry.photoFileName, entry.base64, { base64: true });
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  return downloadBlob(zipBlob, `${fileName}.zip`, projectFolderName, lang);
}

async function downloadBlob(
  blob,
  fileName,
  projectFolderName = null,
  lang = "ru",
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
        lang === "ru"
          ? `XLSX с фотографиями экспортирован (${fileName})`
          : `XLSX with photos exported (${fileName})`,
    };
  }

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

  try {
    await Filesystem.deleteFile({
      path: `${outputFolder}/${fileName}`,
      directory: Directory.Documents,
    });
  } catch (error) {
    console.log("Old export file not found:", error?.message);
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
