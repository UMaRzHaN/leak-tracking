import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

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
    expect(mocks.zipInstances[0].file).toHaveBeenCalledWith(
      "photos/7/7.png",
      "ZmFrZQ==",
      { base64: true },
    );
    expect(mocks.anchorClick).toHaveBeenCalledTimes(1);
    expect(result.message).toBe("Excel project archive exported (report.zip)");
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
    expect(sheet.rows[1].values).toEqual(["14.07.2026", "13:45:12"]);
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
    expect(monitoringSheet.rows[1].values[4]).toBe(
      new Date("2026-07-14T10:00:00.000Z").toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    );
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
    expect(historySheet.rows[0].values).toEqual([
      "No.",
      "Tag",
      "Date",
      "Action",
      "User",
      "Text",
      "Status",
      "Changes JSON",
    ]);
    expect(historySheet.rows[1].values).toEqual([
      1,
      "TAG-9",
      "2026-07-14T12:00:00.000Z",
      "edited",
      "Inspector",
      "",
      "",
      JSON.stringify([{ key: "leak_speed", from: 10, to: 15 }]),
    ]);
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

  it("keeps exportToExcelZip as a backwards-compatible alias", () => {
    expect(exportToExcelZip).toBe(exportToExcelFile);
  });
});
