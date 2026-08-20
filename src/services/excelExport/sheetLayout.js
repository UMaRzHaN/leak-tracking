const EXPORT_YIELD_EVERY = 40;

/** @returns {Promise<void>} */
export function yieldToMainThread() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

export function toExcelTableName(name) {
  return String(name)
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^[^A-Za-z_]/, "_")
    .slice(0, 255);
}

export function getColumnWidth(header, key, rows, { isPhoto = false } = {}) {
  if (isPhoto) return 18;

  const preferred = {
    index: 8,
    leak_id: 12,
    video_id: 12,
    status: 16,
    date: 14,
    time: 12,
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

export function addStructuredTable(sheet, { name, headers, rows, theme }) {
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

export function styleHeaderRow(sheet, fillColor) {
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

export async function styleBodyRows(sheet, rowCount) {
  for (let rowIndex = 2; rowIndex <= rowCount + 1; rowIndex += 1) {
    if (rowIndex > 2 && rowIndex % EXPORT_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }
    const row = sheet.getRow(rowIndex);
    row.alignment = { vertical: "middle", wrapText: true };
  }
}
