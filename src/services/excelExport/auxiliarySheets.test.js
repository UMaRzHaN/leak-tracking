import { describe, expect, it, vi } from "vitest";
import {
  buildHistoryRows,
  buildHistorySheet,
  buildMonitoringSheet,
} from "./auxiliarySheets";

import { translate, translateRu } from "@/test/translate";
import { buildExcelExportTexts } from "./exportTexts";

const enTexts = buildExcelExportTexts(translate);
const ruTexts = buildExcelExportTexts(translateRu);

class FakeCell {
  constructor(value = null) {
    this.value = value;
  }
}

class FakeRow {
  constructor(values = []) {
    this.cells = values.map((value) => new FakeCell(value));
  }

  getCell(index) {
    while (this.cells.length < index) this.cells.push(new FakeCell());
    return this.cells[index - 1];
  }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.columns = new Map();
  }

  addRow(values) {
    const row = new FakeRow(values);
    this.rows.push(row);
    return row;
  }

  addTable({ columns, rows }) {
    this.addRow(columns.map((column) => column.name));
    rows.forEach((row) => this.addRow(row));
  }

  getRow(index) {
    return this.rows[index - 1];
  }

  getColumn(index) {
    if (!this.columns.has(index)) this.columns.set(index, {});
    return this.columns.get(index);
  }
}

function createWorkbook() {
  const workbook = {
    sheets: [],
    addWorksheet: vi.fn((name) => {
      const sheet = new FakeSheet(name);
      workbook.sheets.push(sheet);
      return sheet;
    }),
  };
  return workbook;
}

describe("Excel auxiliary worksheets", () => {
  it("builds history rows with user fallbacks and serialized changes", () => {
    const [row] = buildHistoryRows(
      [
        {
          index: 4,
          leak_id: "TAG-4",
          detectedBy: "Detector",
          history: [
            {
              date: "2026-08-01T10:00:00.000Z",
              action: "edited",
              changes: [{ field: "status", to: "resolved" }],
            },
          ],
        },
      ],
      enTexts,
    );

    expect(row).toMatchObject({
      index: 4,
      leak_id: "TAG-4",
      action: "edited",
      user: "Detector",
      changes: '[{"field":"status","to":"resolved"}]',
    });
    expect(row.date).toBeInstanceOf(Date);
  });

  it("does not create empty history or monitoring worksheets", async () => {
    const workbook = createWorkbook();

    await buildHistorySheet(workbook, [{ history: [] }], enTexts);
    await buildMonitoringSheet(workbook, [], enTexts, {}, "full");

    expect(workbook.addWorksheet).not.toHaveBeenCalled();
  });

  it("creates localized history and monitoring sheets with photo links", async () => {
    const workbook = createWorkbook();
    const leaks = [
      {
        id: 1,
        leak_id: "TAG-1",
        history: [
          {
            date: "2026-08-01T09:00:00.000Z",
            action: "created",
            user: "Inspector",
          },
        ],
        monitoringRecords: [
          {
            date: "2026-08-02T10:00:00.000Z",
            roundNumber: 1,
            result: "resolved",
            photo: "idb://monitoring",
            previousPhoto: "idb://before-monitoring",
          },
        ],
      },
    ];

    await buildHistorySheet(workbook, leaks, ruTexts);
    await buildMonitoringSheet(
      workbook,
      leaks,
      enTexts,
      {
        "monitoring:0:0": "photos/TAG-1/monitoring/record-1.jpg",
        "monitoring:0:0:previousPhoto":
          "photos/TAG-1/monitoring/record-1-previousPhoto.jpg",
      },
      "full",
    );

    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([
      "История",
      "Monitoring",
    ]);
    const historySheet = workbook.sheets[0];
    expect(historySheet.getRow(1).getCell(1).value).toBe("№");
    expect(historySheet.getRow(2).getCell(6).value).toBe("Inspector");

    const monitoringSheet = workbook.sheets[1];
    expect(monitoringSheet.getRow(1).getCell(10).value).toBe(
      "Monitoring photo",
    );
    expect(monitoringSheet.getRow(2).getCell(10).value).toEqual({
      text: "Open photo",
      hyperlink: "photos/TAG-1/monitoring/record-1.jpg",
    });
    expect(monitoringSheet.getRow(1).getCell(11).value).toBe("Previous photo");
    expect(monitoringSheet.getRow(2).getCell(11).value).toEqual({
      text: "Open photo",
      hyperlink: "photos/TAG-1/monitoring/record-1-previousPhoto.jpg",
    });
    expect(monitoringSheet.getColumn(10).width).toBe(18);
    expect(monitoringSheet.getColumn(11).width).toBe(18);
  });
});
