import * as XLSX from "xlsx";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { calculations } from "../utils/calculations";
import { headers, keysOrder, normalizeRow } from "../utils/calculations";

export const exportToExcel = async (rows) => {
  const FOLDER_NAME = "LeakReports";

  if (!rows || rows.length === 0) {
    alert("Нет данных для выгрузки");
    return;
  }

  /* ---------- подготовка данных ---------- */
  const prepared = rows.map((rows) => calculations(rows));

  const preparedOrdered = prepared.map((r) =>
    Object.fromEntries(keysOrder.map((k) => [k, normalizeRow(r)[k]]))
  );
  const ws = XLSX.utils.json_to_sheet(preparedOrdered);
  const wb = XLSX.utils.book_new();

  XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A1" });
  XLSX.utils.book_append_sheet(wb, ws, "Утечки");

  const fileName = `leaks_${Date.now()}.xlsx`;
  console.log(preparedOrdered);
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.mkdir({
        path: FOLDER_NAME,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch (_) {
      // папка уже существует
    }

    const base64 = XLSX.write(wb, {
      bookType: "xlsx",
      type: "base64",
    });

    await Filesystem.writeFile({
      path: `${FOLDER_NAME}/${fileName}`,
      data: base64,
      directory: Directory.Documents,
      encoding: Encoding.BASE64,
    });

    alert(
      `Файл сохранён:\nDocuments/${FOLDER_NAME}/${fileName}`
    );
  }
  /* ---------- Browser ---------- */
  else {
    XLSX.writeFile(wb, fileName);
  }
};
