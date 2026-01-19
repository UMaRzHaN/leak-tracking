import ExcelJS from "exceljs";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { calculations } from "../utils/calculations";
import { normalizeRow } from "../utils/normalizeRow";
import { headers, keysOrder } from "../data/excelImportData";
import { Share } from "@capacitor/share";

/* ===============================
   MAIN EXPORT
   =============================== */
export const exportToExcel = async (rows) => {
  if (!rows?.length) {
    alert("Нет данных для выгрузки");
    return;
  }

  const isMobile = Capacitor.isNativePlatform();
  const prepared = rows.map(calculations);

  if (isMobile) {
    await exportCSV(prepared);
  } else {
    await exportXLSX(prepared);
  }
};

/* ===============================
   DESKTOP → XLSX
   =============================== */
const exportXLSX = async (prepared) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Утечки");

  worksheet.addRow(headers);
  worksheet.getRow(1).font = { bold: true };

  keysOrder.forEach((_, i) => {
    worksheet.getColumn(i + 1).width = i === 28 ? 22 : 16;
  });

  prepared.forEach((r) => {
    const normalized = normalizeRow(r);

    const rowData = keysOrder.map((k) => {
      if (k === "photo") {
        return r.photo ? "См. фото" : "";
      }
      return normalized[k];
    });

    worksheet.addRow(rowData);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const fileName = `leaks_${Date.now()}.xlsx`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
};

/* ===============================
   MOBILE → CSV
   =============================== */
const exportCSV = async (prepared) => {
  const fileName = `leaks_${Date.now()}.csv`;
  const csv = generateCSV(prepared);

  // 1️⃣ пишем во временный cache
  const result = await Filesystem.writeFile({
    path: fileName,
    data: csv,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  // 2️⃣ шарим файл (Google Drive, Telegram, Files, WhatsApp, etc.)
  await Share.share({
    title: "Экспорт утечек",
    text: "CSV файл с данными",
    url: result.uri,
    dialogTitle: "Поделиться файлом",
  });
};

/* ===============================
   CSV GENERATOR
   =============================== */
const generateCSV = (prepared) => {
  const escape = (v) =>
    `"${String(v ?? "")
      .replace(/"/g, '""')
      .replace(/\n/g, " ")}"`;

  const rows = [];

  // headers
  rows.push(headers.map(escape).join(";"));

  // data
  prepared.forEach((r) => {
    const normalized = normalizeRow(r);

    const row = keysOrder.map((k) => {
      if (k === "photo") {
        return escape(r.photo ? "См. фото" : "");
      }
      return escape(normalized[k]);
    });

    rows.push(row.join(";"));
  });

  return "\uFEFF" + rows.join("\n");
};
