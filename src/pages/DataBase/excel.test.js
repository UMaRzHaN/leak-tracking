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

  it("exports plain xlsx and skips zip creation when there are no photos", async () => {
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
    expect(mocks.zipInstances).toHaveLength(0);
    expect(mocks.createObjectURL).toHaveBeenCalledTimes(1);
    expect(mocks.anchorClick).toHaveBeenCalledTimes(1);
    expect(result.message).toBe("XLSX exported (report.xlsx)");
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
    );

    expect(mocks.workbookInstances).toHaveLength(1);
    expect(mocks.zipInstances).toHaveLength(1);
    expect(mocks.zipInstances[0].file).toHaveBeenCalledWith(
      "report.xlsx",
      expect.any(Uint8Array),
    );
    expect(mocks.zipInstances[0].file).toHaveBeenCalledWith(
      "photos/7/7.png",
      "ZmFrZQ==",
      { base64: true },
    );
    expect(mocks.anchorClick).toHaveBeenCalledTimes(1);
    expect(result.message).toBe("XLSX with photos exported (report.zip)");
  });

  it("keeps exportToExcelZip as a backwards-compatible alias", () => {
    expect(exportToExcelZip).toBe(exportToExcelFile);
  });
});
