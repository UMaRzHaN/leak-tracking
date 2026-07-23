import { describe, expect, it } from "vitest";

import { buildWorkbookBufferLocally } from "./excel";

describe("real Excel workbook output", () => {
  it("writes plain numeric tags as numbers and preserves leading-zero tags", async () => {
    const buffer = await buildWorkbookBufferLocally({
      orderedLeaks: [
        { id: 1, leak_id: "101" },
        { id: 2, leak_id: "00101" },
      ],
      orderedRows: [{ leak_id: "101" }, { leak_id: "00101" }],
      headers: ["Tag"],
      keysOrder: ["leak_id"],
      photoMap: {},
      lang: "en",
      monitoringExportMode: "full",
      archivePayload: null,
    });
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Leaks");

    expect(sheet.getCell("A2").value).toBe(101);
    expect(sheet.getCell("A3").value).toBe("00101");
    expect(sheet.getColumn(1).numFmt).not.toBe("@");
  });
});
