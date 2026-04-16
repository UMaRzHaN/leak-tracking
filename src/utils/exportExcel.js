import * as XLSX from "xlsx";

/**
 * Exports leak data to an XLSX file and triggers browser download.
 * @param {object[]} data   — array of leak objects
 * @param {string[]} headers    — column header labels (same length as keysOrder)
 * @param {string[]} keysOrder  — field keys in display order
 * @param {string}   fileName   — output filename (without extension)
 */
export function exportToExcel(data, headers, keysOrder, fileName = "export") {
  const rows = data.map((row) => {
    const obj = {};
    keysOrder.forEach((key, i) => {
      obj[headers[i]] = row[key] ?? "";
    });
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

  /* Auto-width columns */
  const colWidths = headers.map((h, i) => {
    const maxContent = Math.max(
      h.length,
      ...rows.map((r) => String(r[h] ?? "").length),
    );
    return { wch: Math.min(maxContent + 2, 60) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Утечки");
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
