import { describe, expect, it, vi } from "vitest";
import { addBackupSheet, BACKUP_SCHEMA_VERSION } from "./backupSheet";

class FakeCell {
  constructor(value = null) {
    this.value = value;
  }
}

class FakeRow {
  constructor(values = []) {
    this.values = values;
    this.cells = new Map(
      values.map((value, index) => [index + 1, new FakeCell(value)]),
    );
  }

  getCell(index) {
    if (!this.cells.has(index)) this.cells.set(index, new FakeCell());
    return this.cells.get(index);
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

function getSummary(sheet) {
  return Object.fromEntries(
    sheet.rows
      .map((row) => [row.getCell(3).value, row.getCell(4).value])
      .filter(([label]) => typeof label === "string" && label),
  );
}

function readPayload(sheet) {
  return JSON.parse(
    sheet.rows
      .filter((row) => Number.isInteger(row.values[0]))
      .sort((left, right) => left.values[0] - right.values[0])
      .map((row) => row.values[1])
      .join(""),
  );
}

describe("Excel project backup sheet", () => {
  it("does not add a worksheet without an archive payload", () => {
    const workbook = createWorkbook();

    addBackupSheet(workbook, null, "en");

    expect(workbook.addWorksheet).not.toHaveBeenCalled();
  });

  it("stores the exact payload and builds an English summary", () => {
    const workbook = createWorkbook();
    const payload = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: "2026-08-01T10:00:00.000Z",
      project: { name: "North Field", type: "midstream" },
      monitoringRound: { id: "round-2", number: 2 },
      leaks: [
        {
          leak_id: "TAG-1",
          monitoringRecords: [
            {
              date: "2026-08-01T11:00:00.000Z",
              roundId: "round-2",
            },
          ],
          history: [{ action: "created" }],
        },
        {
          leak_id: "TAG-2",
          monitoringRecords: [
            { date: "2026-07-01T11:00:00.000Z", roundNumber: 1 },
          ],
          history: [{ action: "created" }, { action: "edited" }],
        },
      ],
    };

    addBackupSheet(workbook, payload, "en");

    const sheet = workbook.sheets[0];
    const summary = getSummary(sheet);
    expect(sheet.name).toBe("Project Backup");
    expect(sheet.rows[0].values.slice(0, 2)).toEqual([
      "LEAK_TRACKER_EXCEL_BACKUP",
      BACKUP_SCHEMA_VERSION,
    ]);
    expect(readPayload(sheet)).toEqual(payload);
    expect(summary).toMatchObject({
      Project: "North Field",
      "Project type": "Midstream",
      Leaks: 2,
      "Monitoring checks": 2,
      "History records": 3,
      "Current round": 2,
      "Checked in current round": 1,
      "Total in current round": 2,
      "Remaining to check": 1,
      "Backup schema": BACKUP_SCHEMA_VERSION,
    });
    expect(summary["Exported at"]).toBeInstanceOf(Date);
    expect(sheet.getColumn(1).hidden).toBe(true);
    expect(sheet.getColumn(2).hidden).toBe(true);
    expect(sheet.views).toEqual([{ state: "frozen", ySplit: 4 }]);
  });

  it("uses explicit round summary values and splits large payloads", () => {
    const workbook = createWorkbook();
    const payload = {
      project: { name: "Проект", type: "upstream" },
      monitoringRound: {
        number: 5,
        summary: { total: 10, checked: 12 },
      },
      settings: { note: "x".repeat(31_000) },
      leaks: [],
    };

    addBackupSheet(workbook, payload, "ru");

    const sheet = workbook.sheets[0];
    const summary = getSummary(sheet);
    const chunkRows = sheet.rows.filter((row) =>
      Number.isInteger(row.values[0]),
    );
    expect(chunkRows).toHaveLength(2);
    expect(readPayload(sheet)).toEqual(payload);
    expect(summary["Тип проекта"]).toBe("Добыча (Upstream)");
    expect(summary["Проверено в текущем обходе"]).toBe(12);
    expect(summary["Всего в текущем обходе"]).toBe(10);
    expect(summary["Осталось проверить"]).toBe(0);
  });
});
