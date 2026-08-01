import { describe, expect, it } from "vitest";
import {
  addStructuredTable,
  getColumnWidth,
  toExcelTableName,
} from "./sheetLayout";

describe("Excel worksheet layout", () => {
  it("sanitizes and limits structured table names", () => {
    expect(toExcelTableName("2026 Leak History!")).toBe("_026_Leak_History_");
    expect(toExcelTableName("x".repeat(300))).toHaveLength(255);
  });

  it("uses preferred, photo, calculated, and capped column widths", () => {
    expect(getColumnWidth("Tag", "leak_id", [])).toBe(12);
    expect(getColumnWidth("Photo", "photo", [], { isPhoto: true })).toBe(18);
    expect(getColumnWidth("Custom", "custom", [{ custom: "123456789" }])).toBe(
      11,
    );
    expect(
      getColumnWidth("Custom", "custom", [{ custom: "x".repeat(100) }]),
    ).toBe(36);
  });

  it("falls back to ordinary rows when addTable is unavailable", () => {
    const rows = [];
    const sheet = {
      addRow(row) {
        rows.push(row);
      },
    };

    addStructuredTable(sheet, {
      name: "History",
      headers: ["Tag", "Status"],
      rows: [["TAG-1", "open"]],
      theme: "TableStyleMedium9",
    });

    expect(rows).toEqual([
      ["Tag", "Status"],
      ["TAG-1", "open"],
    ]);
    expect(sheet.views).toEqual([{ state: "frozen", ySplit: 1 }]);
  });
});
