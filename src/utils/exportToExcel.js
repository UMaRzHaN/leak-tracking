import ExcelJS from "exceljs";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { calculations } from "../utils/calculations";
import { normalizeRow } from "../utils/normalizeRow";
import { headers, keysOrder } from "../data/excelImportData";

export const exportToExcel = async (rows) => {
  const FOLDER_NAME = "LeakReports";
  const isMobile = Capacitor.isNativePlatform();

  if (!rows?.length) {
    alert("Нет данных для выгрузки");
    return;
  }

  /* ---------- подготовка данных ---------- */
  const prepared = rows.map(calculations);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Утечки", {
    properties: { defaultRowHeight: 28 },
  });

  /* ---------- заголовки ---------- */
  worksheet.addRow(headers);
  worksheet.getRow(1).font = { bold: true };

  /* ---------- ширины колонок ---------- */
  keysOrder.forEach((_, i) => {
    worksheet.getColumn(i + 1).width = i === 28 ? 22 : 16; // колонка фото шире
  });

  /* ---------- helpers ---------- */
  const isValidBase64Image = (str) =>
    typeof str === "string" &&
    str.startsWith("data:image/") &&
    str.includes("base64,");

  /* ---------- данные ---------- */
  prepared.forEach((r) => {
    const normalized = normalizeRow(r);

    // строка без фото
    const rowData = keysOrder.map((k) => {
      if (k === "photo") {
        return r.photo
          ? { text: "📷 Открыть фото", hyperlink: `file://${r.photo}` }
          : "";
      }
      return normalized[k];
    });

    const excelRow = worksheet.addRow(rowData);
    excelRow.height = 90;

    /* ---------- фото (ТОЛЬКО не mobile) ---------- */
    if (!isMobile && isValidBase64Image(r.photoPreview)) {
      const base64 = r.photoPreview.replace(/^data:image\/\w+;base64,/, "");

      const imageId = workbook.addImage({
        base64,
        extension: "jpeg",
      });

      worksheet.addImage(imageId, {
        tl: {
          col: keysOrder.indexOf("photo"),
          row: excelRow.number - 1,
        },
        ext: {
          width: 130,
          height: 90,
        },
      });
    }
  });

  const fileName = `leaks_${Date.now()}.xlsx`;

  /* ---------- MOBILE ---------- */
  if (isMobile) {
    await Filesystem.requestPermissions();

    await Filesystem.mkdir({
      path: FOLDER_NAME,
      directory: Directory.Documents,
      recursive: true,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = await arrayBufferToBase64(buffer);

    await Filesystem.writeFile({
      path: `${FOLDER_NAME}/${fileName}`,
      data: base64,
      directory: Directory.Documents,
      encoding: Encoding.BASE64,
    });

    alert(
      `✅ Экспорт завершён\n\nФайл:\nDocuments/${FOLDER_NAME}/${fileName}\n` +
        `Строк: ${prepared.length}\n\n` +
        `ℹ️ На мобильных фото не добавляются`
    );
  } else {
    /* ---------- BROWSER ---------- */
    const buffer = await workbook.xlsx.writeBuffer();

    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
  }
};

/* ---------- utils ---------- */
const arrayBufferToBase64 = async (buffer) => {
  const blob = new Blob([buffer]);
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
