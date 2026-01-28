import ExcelJS from "exceljs";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Toast } from "@capacitor/toast";

import { normalizeRow } from "../utils/normalize/normalizeRow";

/* ===============================
   TOAST
================================ */
const showToast = async (message, duration = "short") => {
  await Toast.show({
    text: message,
    duration, // "short" | "long"
    position: "bottom",
  });
};

/* ===============================
   MAIN EXPORT
================================ */
export const exportToExcel = async (rows, excelConfig) => {
  if (!rows?.length) {
    await showToast("❌ Нет данных для выгрузки");
    return;
  }

  if (!excelConfig?.headers || !excelConfig?.keysOrder) {
    throw new Error("Excel config is missing headers or keysOrder");
  }

  const { headers, keysOrder } = excelConfig;

  const isMobile = Capacitor.isNativePlatform();

  try {
    await showToast("⏳ Экспорт данных…");

    if (isMobile) {
      await exportCSV(rows, headers, keysOrder);
    } else {
      await exportXLSX(rows, headers, keysOrder);
    }

    await showToast("✅ Экспорт завершён");
  } catch (e) {
    console.error("Export error:", e);
    await showToast("❌ Ошибка при экспорте", "long");
  }
};

/* ===============================
   DESKTOP → XLSX
================================ */
const exportXLSX = async (prepared, headers, keysOrder) => {
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
        return r.photo ? "См. фото в приложении" : "";
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
  if (fileName) {
    alert("📁 Файл Excel успешно сохранен на вашем компьютере.");
  }
  link.download = fileName;
  link.click();
};

/* ===============================
   MOBILE → CSV
================================ */
const exportCSV = async (prepared, headers, keysOrder, withShare = false) => {
  const folder = "LeakReports";
  const fileName = `leaks_${Date.now()}.csv`;
  const csv = generateCSV(prepared, headers, keysOrder);

  await Filesystem.mkdir({
    path: folder,
    directory: Directory.Documents,
    recursive: true,
  }).catch(() => {});

  const result = await Filesystem.writeFile({
    path: `${folder}/${fileName}`,
    data: csv,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });

  await showToast(`📁 CSV сохранён:\nDocuments/${folder}/${fileName}`, "long");

  if (withShare) {
    await Share.share({
      title: "Экспорт утечек",
      text: "CSV файл с данными",
      url: result.uri,
    });
  }
};

/* ===============================
   CSV GENERATOR
================================ */
const generateCSV = (prepared, headers, keysOrder) => {
  const escape = (v) =>
    `"${String(v ?? "")
      .replace(/\//g, "#")
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
        return escape(r.photo ? r.photo.split("/").pop() : "");
      }
      return escape(normalized[k]);
    });

    rows.push(row.join(";"));
  });

  return "\uFEFF" + rows.join("\n");
};
