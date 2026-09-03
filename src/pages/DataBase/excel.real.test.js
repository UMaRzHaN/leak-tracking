import { describe, expect, it } from "vitest";

import { translate } from "@/test/translate";
import { buildExcelExportTexts } from "@/services/excelExport/exportTexts";
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
      texts: buildExcelExportTexts(translate),
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
  }, 60_000);

  it("выкладывает каждую попытку ремонта отдельной строкой", async () => {
    // Вехой в книгу попадала одна починка — последняя, — и утечка, которую
    // чинили дважды, выглядела в выгрузке починенной с первого раза.
    const event = (id, type, iso) => ({ id, type, date: iso });
    const buffer = await buildWorkbookBufferLocally({
      orderedLeaks: [
        {
          id: 1,
          index: 1,
          leak_id: "A-42",
          events: [
            event("e1", "repair_started", "2026-08-01T08:00:00.000Z"),
            event("e2", "repair_done", "2026-08-01T14:00:00.000Z"),
            event("e3", "repair_started", "2026-08-05T08:00:00.000Z"),
            event("e4", "repair_done", "2026-08-06T08:00:00.000Z"),
          ],
        },
      ],
      orderedRows: [{ leak_id: "A-42" }],
      headers: ["Tag"],
      keysOrder: ["leak_id"],
      photoMap: {},
      texts: buildExcelExportTexts(translate),
      monitoringExportMode: "full",
      archivePayload: null,
    });

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Repairs");

    expect(sheet).toBeDefined();
    // Две строки — две попытки.
    expect(sheet.getCell("C2").value).toBe(1);
    expect(sheet.getCell("C3").value).toBe(2);
    // Часы числом, чтобы книга умела их складывать и сортировать.
    expect(sheet.getCell("H2").value).toBe(6);
    expect(sheet.getCell("H3").value).toBe(24);
  }, 60_000);

  it("не заводит лист ремонтов, когда чинить было нечего", async () => {
    const buffer = await buildWorkbookBufferLocally({
      orderedLeaks: [{ id: 1, leak_id: "A-42" }],
      orderedRows: [{ leak_id: "A-42" }],
      headers: ["Tag"],
      keysOrder: ["leak_id"],
      photoMap: {},
      texts: buildExcelExportTexts(translate),
      monitoringExportMode: "full",
      archivePayload: null,
    });

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.getWorksheet("Repairs")).toBeUndefined();
  }, 60_000);

  it("ставит ссылку на снимок ремонта, когда файл в книге есть", async () => {
    const event = (id, type, iso, photo) => ({ id, type, date: iso, photo });
    const buffer = await buildWorkbookBufferLocally({
      orderedLeaks: [
        {
          id: 1,
          index: 1,
          leak_id: "A-42",
          events: [
            event(
              "e1",
              "repair_started",
              "2026-08-01T08:00:00.000Z",
              "idb://start",
            ),
            event(
              "e2",
              "repair_done",
              "2026-08-01T14:00:00.000Z",
              "idb://done",
            ),
          ],
        },
      ],
      orderedRows: [{ leak_id: "A-42" }],
      headers: ["Tag"],
      keysOrder: ["leak_id"],
      // Снимок начала выгружен, снимок завершения прочитать не удалось.
      photoMap: { "event:0:0": "photos/leak-1/events/event-1.jpg" },
      texts: buildExcelExportTexts(translate),
      monitoringExportMode: "full",
      archivePayload: null,
    });

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Repairs");

    expect(sheet.getCell("L2").value).toMatchObject({
      hyperlink: "photos/leak-1/events/event-1.jpg",
    });
    // Про снимок, которого в книге нет, сказано словами, а не ссылкой в никуда.
    expect(sheet.getCell("M2").value).toBe("Present (file missing)");
  }, 60_000);
});
