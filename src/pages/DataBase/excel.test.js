import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

function excelTimeValue(value) {
  const date = new Date(value);
  return (
    (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) /
    86_400
  );
}
const mocks = vi.hoisted(() => {
  const workbookInstances = [];
  const zipInstances = [];
  const createObjectURL = vi.fn(() => "blob:mock-url");
  const revokeObjectURL = vi.fn();
  const anchorClick = vi.fn();
  const getPhotoSrcMock = vi.fn();

  class MockCell {
    constructor() {
      this.value = null;
      this.font = null;
      this.numFmt = null;
    }
  }

  class MockRow {
    constructor(values = []) {
      this.values = values;
      this.font = null;
      this.fill = null;
      this.alignment = null;
      this.height = null;
      this.cells = new Map();
    }

    getCell(index) {
      if (!this.cells.has(index)) {
        this.cells.set(index, new MockCell());
      }

      return this.cells.get(index);
    }
  }

  class MockSheet {
    constructor() {
      this.rows = [];
      this.columns = new Map();
    }

    addRow(values) {
      const row = new MockRow(values);
      this.rows.push(row);
      return row;
    }

    getRow(index) {
      return this.rows[index - 1];
    }

    getColumn(index) {
      if (!this.columns.has(index)) {
        this.columns.set(index, { width: null });
      }

      return this.columns.get(index);
    }

    addTable({ columns = [], rows = [] }) {
      this.addRow(columns.map((column) => column.name));
      rows.forEach((row) => this.addRow(row));
    }
  }

  class MockWorkbook {
    constructor() {
      this.sheets = [];
      this.xlsx = {
        writeBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      };
      workbookInstances.push(this);
    }

    addWorksheet() {
      const sheet = new MockSheet();
      this.sheets.push(sheet);
      return sheet;
    }
  }

  class MockZip {
    constructor() {
      this.file = vi.fn();
      this.generateAsync = vi
        .fn()
        .mockResolvedValue(new Blob(["zip"], { type: "application/zip" }));
      zipInstances.push(this);
    }
  }

  return {
    workbookInstances,
    zipInstances,
    createObjectURL,
    revokeObjectURL,
    anchorClick,
    getPhotoSrcMock,
    MockWorkbook,
    MockZip,
  };
});

vi.mock("exceljs", () => ({
  default: {
    Workbook: mocks.MockWorkbook,
  },
}));

vi.mock("jszip", () => ({
  default: mocks.MockZip,
}));

vi.mock("@/utils/platform", () => ({
  isNative: false,
}));

vi.mock("@/hooks/photoService", () => ({
  getPhotoSrc: mocks.getPhotoSrcMock,
}));

vi.mock("@/utils/photoConversion", () => ({
  blobToDataUri: vi.fn(),
}));

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    mkdir: vi.fn(),
    deleteFile: vi.fn(),
    writeFile: vi.fn(),
  },
  Directory: {
    Documents: "Documents",
  },
}));

const { exportToExcelFile, exportToExcelZip } = await import("./excel");

describe("excel export helpers", () => {
  let createElementSpy;
  let originalCreateElement;

  beforeEach(() => {
    mocks.workbookInstances.length = 0;
    mocks.zipInstances.length = 0;
    mocks.createObjectURL.mockClear();
    mocks.revokeObjectURL.mockClear();
    mocks.anchorClick.mockClear();
    mocks.getPhotoSrcMock.mockReset();

    vi.stubGlobal("URL", {
      createObjectURL: mocks.createObjectURL,
      revokeObjectURL: mocks.revokeObjectURL,
    });

    originalCreateElement = document.createElement.bind(document);
    createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName) => {
        if (tagName !== "a") {
          return originalCreateElement(tagName);
        }

        return {
          href: "",
          download: "",
          click: mocks.anchorClick,
        };
      });
  });

  afterEach(() => {
    createElementSpy?.mockRestore();
    vi.unstubAllGlobals();
  });

  it("exports a portable Excel zip even when there are no photos", async () => {
    const result = await exportToExcelFile(
      [{ id: 2, leak_id: 2 }],
      [{ id: 2, name: "Leak 2", photo: "", photo_after: "" }],
      ["ID", "Name", "Photo", "After"],
      ["id", "name", "photo", "photo_after"],
      "report",
      null,
      null,
      "en",
    );

    expect(mocks.workbookInstances).toHaveLength(1);
    expect(mocks.zipInstances).toHaveLength(1);
    expect(mocks.zipInstances[0].file).toHaveBeenCalledWith(
      "report.xlsx",
      expect.any(Uint8Array),
    );
    const backupSheet = mocks.workbookInstances[0].sheets.at(-1);
    expect(backupSheet.rows[0].values[0]).toBe("LEAK_TRACKER_EXCEL_BACKUP");
    expect(backupSheet.rows[2].values[1]).toContain('"leak_id":2');
    expect(mocks.createObjectURL).toHaveBeenCalledTimes(1);
    expect(mocks.anchorClick).toHaveBeenCalledTimes(1);
    expect(result.message).toBe("Excel project archive exported (report.zip)");
    expect(result.metrics).toEqual({
      photosMs: expect.any(Number),
      workbookMs: expect.any(Number),
      zipMs: expect.any(Number),
      totalMs: expect.any(Number),
    });
  });

  it("exports zip with linked photos when photos are present", async () => {
    mocks.getPhotoSrcMock.mockResolvedValue("data:image/png;base64,ZmFrZQ==");

    const result = await exportToExcelFile(
      [{ id: 1, leak_id: 7, photo: "file://photo.png" }],
      [{ id: 1, name: "Leak 1", photo: "Yes", photo_after: "" }],
      ["ID", "Name", "Photo", "After"],
      ["id", "name", "photo", "photo_after"],
      "report",
      null,
      null,
      "en",
      {
        project: { name: "North Field", type: "midstream" },
      },
    );

    expect(mocks.workbookInstances).toHaveLength(1);
    expect(mocks.zipInstances).toHaveLength(1);
    expect(mocks.zipInstances[0].file).toHaveBeenCalledWith(
      "report.xlsx",
      expect.any(Uint8Array),
    );
    expect(mocks.zipInstances[0].file).not.toHaveBeenCalledWith(
      "excel-project.json",
      expect.anything(),
    );
    const backupSheet = mocks.workbookInstances[0].sheets.at(-1);
    expect(backupSheet.rows[2].values[1]).toContain('"type":"midstream"');
    expect(backupSheet.getColumn(1).hidden).toBe(true);
    expect(backupSheet.getColumn(2).hidden).toBe(true);
    expect(backupSheet.rows[0].values[2]).toBe("Project backup");
    expect(backupSheet.getRow(4).getCell(3).value).toBe("Field");
    expect(backupSheet.getRow(4).getCell(4).value).toBe("Value");
    expect(backupSheet.getRow(5).getCell(3).value).toBe("Project");
    expect(backupSheet.getRow(5).getCell(4).value).toBe("North Field");
    expect(backupSheet.getRow(8).getCell(3).value).toBe("Leaks");
    expect(backupSheet.getRow(8).getCell(4).value).toBe(1);
    expect(mocks.getPhotoSrcMock).toHaveBeenCalledTimes(1);
    expect(mocks.zipInstances[0].file).toHaveBeenCalledWith(
      "photos/7/7.png",
      "ZmFrZQ==",
      { base64: true },
    );
    expect(mocks.anchorClick).toHaveBeenCalledTimes(1);
    expect(result.message).toBe("Excel project archive exported (report.zip)");
    expect(result.metrics).toEqual({
      photosMs: expect.any(Number),
      workbookMs: expect.any(Number),
      zipMs: expect.any(Number),
      totalMs: expect.any(Number),
    });
  });

  it("replaces invalid Date cell values with blanks before writing xlsx", async () => {
    const invalidDate = new Date("not-a-date");

    await exportToExcelFile(
      [{ id: 1, leak_id: 1 }],
      [{ id: 1, date: invalidDate, resolvedAt: invalidDate }],
      ["ID", "Date", "Resolved"],
      ["id", "date", "resolvedAt"],
      "report",
      null,
      null,
      "en",
    );

    const sheet = mocks.workbookInstances[0].sheets[0];
    expect(sheet.rows[1].values).toEqual([1, "", ""]);
  });

  it("exports the leak creation time in a separate column", async () => {
    await exportToExcelFile(
      [
        {
          id: 1,
          leak_id: 1,
          createdAt: new Date(2026, 6, 14, 13, 45, 12),
        },
      ],
      [{ date: "14.07.2026" }],
      ["Date", "Time"],
      ["date", "time"],
      "report",
      null,
      null,
      "en",
    );

    const sheet = mocks.workbookInstances[0].sheets[0];
    expect(sheet.rows[1].values).toEqual([
      new Date(Date.UTC(2026, 6, 14)),
      excelTimeValue(new Date(2026, 6, 14, 13, 45, 12)),
    ]);
    expect(sheet.getColumn(1).numFmt).toBe("dd.mm.yyyy");
    expect(sheet.getColumn(2).numFmt).toBe("hh:mm:ss");
  });

  it("exports identifiers, numbers, percentages, and coordinates with semantic formats", async () => {
    await exportToExcelFile(
      [
        { id: 1, leak_id: "00101" },
        { id: 2, leak_id: "101" },
      ],
      [
        {
          index: "2",
          leak_id: "00101",
          pressure: "12.5",
          flareShare: "0.5",
          lat: "47.123456",
          status: "Open",
        },
        {
          index: "3",
          leak_id: "101",
          pressure: "8",
          flareShare: "0.25",
          lat: "48",
          status: "Open",
        },
      ],
      ["No.", "Tag", "Pressure", "Share", "Latitude", "Status"],
      ["index", "leak_id", "pressure", "flareShare", "lat", "status"],
      "report",
      null,
      null,
      "en",
    );

    const sheet = mocks.workbookInstances[0].sheets[0];
    expect(sheet.rows[1].values).toEqual([
      2,
      "00101",
      12.5,
      0.5,
      47.123456,
      "Open",
    ]);
    expect(sheet.getColumn(1).numFmt).toBe("#,##0");
    expect(sheet.rows[2].values[1]).toBe(101);
    expect(sheet.getColumn(2).numFmt).toBe("General");
    expect(sheet.getColumn(3).numFmt).toBe("#,##0.00");
    expect(sheet.getColumn(4).numFmt).toBe("0.0%");
    expect(sheet.getColumn(5).numFmt).toBe("0.000000");
    expect(sheet.getColumn(6).numFmt).toBe("@");
  });

  it("exports the Russian leak question with concise monitoring answers", async () => {
    await exportToExcelFile(
      [
        {
          id: 1,
          leak_id: "TAG-1",
          monitoringRecords: [
            {
              id: "check-yes",
              roundNumber: 1,
              date: "2026-07-14T10:00:00.000Z",
              result: "still_leaking",
            },
            {
              id: "check-no",
              roundNumber: 2,
              date: "2026-07-15T10:00:00.000Z",
              result: "resolved",
            },
            {
              id: "check-repair",
              roundNumber: 3,
              date: "2026-07-16T10:00:00.000Z",
              result: "needs_recheck",
            },
          ],
        },
      ],
      [{ id: 1, name: "Leak 1" }],
      ["ID", "Name"],
      ["id", "name"],
      "report",
      null,
      null,
      "ru",
    );

    const monitoringSheet = mocks.workbookInstances[0].sheets[1];
    expect(monitoringSheet.rows[0].values[6]).toBe("Утечка есть");
    expect(monitoringSheet.rows[1].values[6]).toBe("Да");
    expect(monitoringSheet.rows[2].values[6]).toBe("Нет");
    expect(monitoringSheet.rows[3].values[6]).toBe("В ремонте");
  });
  it("exports every repeated monitoring record with its own photo link", async () => {
    mocks.getPhotoSrcMock.mockResolvedValue("data:image/png;base64,ZmFrZQ==");

    await exportToExcelFile(
      [
        {
          id: 1,
          leak_id: 7,
          monitoringRecords: [
            {
              id: "check-1",
              roundId: "round-4",
              roundNumber: 4,
              date: "2026-07-14T10:00:00.000Z",
              result: "still_leaking",
              photo: "idb://monitoring-1",
            },
            {
              id: "check-2",
              roundId: "round-4",
              roundNumber: 4,
              date: "2026-07-14T11:00:00.000Z",
              result: "resolved",
              photo: "idb://monitoring-2",
            },
          ],
        },
      ],
      [{ id: 1, name: "Leak 1" }],
      ["ID", "Name"],
      ["id", "name"],
      "report",
      vi.fn().mockResolvedValue("data:image/png;base64,ZmFrZQ=="),
      null,
      "en",
    );

    const monitoringSheet = mocks.workbookInstances[0].sheets[1];
    expect(monitoringSheet.rows).toHaveLength(3);
    expect(monitoringSheet.rows[0].values).toContain("Monitoring time");
    expect(monitoringSheet.rows[1].values[3]).toEqual(
      new Date("2026-07-14T10:00:00.000Z"),
    );
    expect(monitoringSheet.rows[1].values[4]).toBe(
      excelTimeValue("2026-07-14T10:00:00.000Z"),
    );
    expect(monitoringSheet.getColumn(4).numFmt).toBe("dd.mm.yyyy");
    expect(monitoringSheet.getColumn(5).numFmt).toBe("hh:mm:ss");
    expect(monitoringSheet.getRow(2).getCell(10).value).toEqual({
      text: "Open photo",
      hyperlink: "photos/7/monitoring/7_monitoring_1.png",
    });
    expect(monitoringSheet.getRow(3).getCell(10).value).toEqual({
      text: "Open photo",
      hyperlink: "photos/7/monitoring/7_monitoring_2.png",
    });
    expect(mocks.zipInstances[0].file).toHaveBeenCalledWith(
      "photos/7/monitoring/7_monitoring_1.png",
      "ZmFrZQ==",
      { base64: true },
    );
    expect(mocks.zipInstances[0].file).toHaveBeenCalledWith(
      "photos/7/monitoring/7_monitoring_2.png",
      "ZmFrZQ==",
      { base64: true },
    );
  });

  it("exports leak history to a dedicated history sheet", async () => {
    await exportToExcelFile(
      [
        {
          id: 1,
          leak_id: "TAG-9",
          detectedBy: "Inspector",
          history: [
            {
              action: "edited",
              date: "2026-07-14T12:00:00.000Z",
              changes: [{ key: "leak_speed", from: 10, to: 15 }],
            },
          ],
        },
      ],
      [{ id: 1, leak_id: "TAG-9", name: "Leak 1" }],
      ["ID", "Tag", "Name"],
      ["id", "leak_id", "name"],
      "report",
      null,
      null,
      "en",
    );

    const historySheet = mocks.workbookInstances[0].sheets[1];
    const historyDate = new Date("2026-07-14T12:00:00.000Z");
    const expectedTime = excelTimeValue(historyDate);
    expect(historySheet.rows[0].values).toEqual([
      "No.",
      "Tag",
      "Date",
      "Time",
      "Action",
      "User",
      "Text",
      "Status",
      "Changes JSON",
    ]);
    expect(historySheet.rows[1].values).toEqual([
      1,
      "TAG-9",
      historyDate,
      expectedTime,
      "edited",
      "Inspector",
      "",
      "",
      JSON.stringify([{ key: "leak_speed", from: 10, to: 15 }]),
    ]);
    expect(historySheet.getColumn(3).numFmt).toBe("dd.mm.yyyy");
    expect(historySheet.getColumn(4).numFmt).toBe("hh:mm:ss");
  });

  it("can export only the latest monitoring record per tag and round", async () => {
    const records = [
      {
        id: "check-1",
        roundId: "round-4",
        roundNumber: 4,
        date: "2026-07-14T10:00:00.000Z",
        result: "still_leaking",
        photo: "idb://monitoring-1",
      },
      {
        id: "check-2",
        roundId: "round-4",
        roundNumber: 4,
        date: "2026-07-14T11:00:00.000Z",
        result: "resolved",
        photo: "idb://monitoring-2",
      },
    ];

    await exportToExcelFile(
      [{ id: 1, leak_id: 7, monitoringRecords: records }],
      [{ id: 1, name: "Leak 1" }],
      ["ID", "Name"],
      ["id", "name"],
      "report",
      vi.fn().mockResolvedValue("data:image/png;base64,ZmFrZQ=="),
      null,
      "en",
      { monitoringExportMode: "latest_per_round" },
    );

    const monitoringSheet = mocks.workbookInstances[0].sheets[1];
    expect(monitoringSheet.rows).toHaveLength(2);
    expect(monitoringSheet.getRow(2).getCell(10).value).toEqual({
      text: "Open photo",
      hyperlink: "photos/7/monitoring/7_monitoring_2.png",
    });
    expect(mocks.zipInstances[0].file).toHaveBeenCalledWith(
      "photos/7/monitoring/7_monitoring_1.png",
      "ZmFrZQ==",
      { base64: true },
    );
    expect(mocks.zipInstances[0].file).toHaveBeenCalledWith(
      "photos/7/monitoring/7_monitoring_2.png",
      "ZmFrZQ==",
      { base64: true },
    );
  });

  it("adds typed current-round progress to the project backup summary", async () => {
    await exportToExcelFile(
      [
        {
          id: 1,
          leak_id: "TAG-1",
          monitoringRecords: [
            {
              id: "check-1",
              roundId: "round-5",
              roundNumber: 5,
              date: "2026-07-23T10:00:00.000Z",
              result: "still_leaking",
            },
          ],
        },
        { id: 2, leak_id: "TAG-2" },
      ],
      [
        { index: 1, leak_id: "TAG-1" },
        { index: 2, leak_id: "TAG-2" },
      ],
      ["No.", "Tag"],
      ["index", "leak_id"],
      "report",
      null,
      null,
      "en",
      {
        project: { name: "North Field", type: "upstream" },
        monitoringRound: {
          id: "round-5",
          number: 5,
          startedAt: "2026-07-23T09:00:00.000Z",
        },
      },
    );

    const backupSheet = mocks.workbookInstances[0].sheets.at(-1);
    expect(backupSheet.getRow(7).getCell(4).value).toBeInstanceOf(Date);
    expect(backupSheet.getRow(7).getCell(4).numFmt).toBe("dd.mm.yyyy hh:mm:ss");
    expect(backupSheet.getRow(11).getCell(4).value).toBe(5);
    expect(backupSheet.getRow(11).getCell(4).numFmt).toBe('"No. "0');
    expect(backupSheet.getRow(12).getCell(3).value).toBe(
      "Checked in current round",
    );
    expect(backupSheet.getRow(12).getCell(4).value).toBe(1);
    expect(backupSheet.getRow(13).getCell(4).value).toBe(2);
    expect(backupSheet.getRow(14).getCell(4).value).toBe(1);
    expect(backupSheet.getRow(12).getCell(4).numFmt).toBe("#,##0");
  });

  it("limits concurrent photo reads while exporting", async () => {
    let active = 0;
    let maxActive = 0;
    mocks.getPhotoSrcMock.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return "data:image/png;base64,ZmFrZQ==";
    });
    const leaks = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      leak_id: index + 1,
      photo: `file://photo-${index}.png`,
    }));

    await exportToExcelFile(
      leaks,
      leaks.map((leak) => ({ id: leak.id, photo: "Yes" })),
      ["ID", "Photo"],
      ["id", "photo"],
      "report",
      null,
      null,
      "en",
    );

    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(mocks.getPhotoSrcMock).toHaveBeenCalledTimes(12);
  });
  it("keeps exportToExcelZip as a backwards-compatible alias", () => {
    expect(exportToExcelZip).toBe(exportToExcelFile);
  });
});
