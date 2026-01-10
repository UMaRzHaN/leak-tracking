import * as XLSX from "xlsx";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { calculations } from "../utils/calculations";
import { normalizeRow } from "../utils/normalizeRow";
import { headers, keysOrder } from "../data/excelImportData";

export const exportToExcel = async (rows) => {
  const FOLDER_NAME = "LeakReports";

  if (!rows || rows.length === 0) {
    alert("Нет данных для выгрузки");
    return;
  }

  /* ---------- подготовка данных ---------- */
  const prepared = rows.map((rows) => calculations(rows));

  const preparedOrdered = prepared.map((r) =>
    Object.fromEntries(
      keysOrder.map((k) => {
        if (k === "photo" && r.photo) {
          return [k, `Documents/${FOLDER_NAME}/photo_${r.leak_id}.jpg`];
        }
        return [k, normalizeRow(r)[k]];
      })
    )
  );
  const ws = XLSX.utils.json_to_sheet(preparedOrdered);
  const wb = XLSX.utils.book_new();

  XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A1" });
  XLSX.utils.book_append_sheet(wb, ws, "Утечки");

  const fileName = `leaks_${Date.now()}.xlsx`;
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

    alert(`Файл сохранён:\nDocuments/${FOLDER_NAME}/${fileName}`);
  } else {
    /* ---------- Browser ---------- */
    // for (const row of prepared) {
    //   if (!row.photo) continue;

    //   const base64 = row.photo.split(",")[1];
    //   const photoName = `photo_${row.leak_id}.jpg`;

    //   await Filesystem.writeFile({
    //     path: `${FOLDER_NAME}/${photoName}`,
    //     data: base64,
    //     directory: Directory.Documents,
    //     encoding: Encoding.BASE64,
    //   });
    // }

    XLSX.writeFile(wb, fileName);
  }
};

// import ExcelJS from "exceljs";
// import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
// import { Capacitor } from "@capacitor/core";
// import { calculations } from "../utils/calculations";
// import { normalizeRow } from "../utils/normalizeRow";
// import { headers, keysOrder } from "../data/excelImportData";

// export const exportToExcel = async (rows) => {
//   const FOLDER_NAME = "LeakReports";
//   const isMobile = Capacitor.isNativePlatform();

//   if (!rows?.length) {
//     alert("Нет данных для выгрузки");
//     return;
//   }

//   const prepared = rows.map((r) => calculations(r));

//   const wb = new ExcelJS.Workbook();
//   const ws = wb.addWorksheet("Утечки");
//   ws.addRow(headers);
//   ws.getColumn(29).width = 22;
//   const arrayBufferToBase64 = async (buffer) => {
//     const blob = new Blob([buffer], {
//       type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//     });

//     return await new Promise((resolve, reject) => {
//       const reader = new FileReader();
//       reader.onloadend = () => {
//         const base64 = reader.result.split(",")[1];
//         resolve(base64);
//       };
//       reader.onerror = reject;
//       reader.readAsDataURL(blob);
//     });
//   };

//   const isValidBase64Image = (str) =>
//     typeof str === "string" &&
//     str.startsWith("data:image/") &&
//     str.includes("base64,");
//   prepared.forEach((r) => {
//     const normalized = normalizeRow(r);

//     // 1. Добавляем строку БЕЗ фото
//     const rowData = keysOrder.map((k) => (k === "photo" ? "" : normalized[k]));

//     const excelRow = ws.addRow(rowData);
//     excelRow.height = 90;

//     // 2. Фото ТОЛЬКО из photoPreview + ОГРАНИЧЕНИЕ РАЗМЕРА
//     // 📱 На телефоне фото НЕ вставляем
//     if (!isMobile && isValidBase64Image(r.photoPreview)) {
//       const base64 = r.photoPreview.replace(/^data:image\/\w+;base64,/, "");

//       const imageId = wb.addImage({
//         base64,
//         extension: "jpeg",
//       });

//       ws.addImage(imageId, {
//         tl: {
//           col: 28, // колонка "Фото утечки"
//           row: excelRow.number - 1,
//         },
//         ext: {
//           width: 130,
//           height: 90,
//         },
//       });
//     }
//   });
//   console.log(
//     "EXPORT",
//     prepared.length,
//     prepared.map((r) => r.photoPreview?.length || 0)
//   );

//   const buffer = await wb.xlsx.writeBuffer();
//   const fileName = `leaks_${Date.now()}.xlsx`;

//   if (Capacitor.isNativePlatform()) {
//     await Filesystem.requestPermissions();

//     await Filesystem.mkdir({
//       path: FOLDER_NAME,
//       directory: Directory.Documents,
//       recursive: true,
//     });

//     await Filesystem.writeFile({
//       path: `${FOLDER_NAME}/${fileName}`,
//       data: await arrayBufferToBase64(buffer),
//       directory: Directory.Documents,
//       encoding: Encoding.BASE64,
//     });

//     alert(
//       `✅ Экспорт завершён успешно!\n\n` +
//         `Файл:\nDocuments/${FOLDER_NAME}/${fileName}\n` +
//         `Строк: ${prepared.length}\n\n` +
//         (isMobile
//           ? "ℹ️ На телефоне фото в Excel не добавляются"
//           : "🖼 Фото включены в Excel")
//     );
//   } else {
//     const blob = new Blob([buffer], {
//       type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//     });

//     const link = document.createElement("a");
//     link.href = URL.createObjectURL(blob);
//     link.download = fileName;
//     link.click();
//   }
// };
