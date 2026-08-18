import { describe, expect, it, vi } from "vitest";
import {
  buildComponentRows,
  buildComponentSheet,
} from "@/services/excelExport/componentSheet";

function createWorkbook() {
  const sheets = [];
  return {
    sheets,
    addWorksheet: vi.fn((name) => {
      const columns = new Map();
      const sheet = {
        name,
        rows: [],
        tables: [],
        addTable: vi.fn((table) => sheet.tables.push(table)),
        getRow: vi.fn(() => ({
          eachCell: vi.fn(),
          getCell: vi.fn(() => ({})),
          font: {},
          fill: {},
          height: 0,
          commit: vi.fn(),
        })),
        getColumn: vi.fn((index) => {
          if (!columns.has(index)) columns.set(index, {});
          return columns.get(index);
        }),
        columnWidths: columns,
      };
      sheets.push(sheet);
      return sheet;
    }),
  };
}

const spec = {
  name: "Компоненты",
  headers: ["№", "Наименование компонента", "Индивидуальный номер компонента"],
  keysOrder: ["index", "component_name", "component_uid"],
  rows: [
    { index: 1, component_name: "Задвижка", component_uid: "1" },
    { index: 2, component_name: "Труба", component_uid: "2" },
  ],
};

describe("component sheet", () => {
  it("writes the registry into the same workbook as the leaks", async () => {
    const workbook = createWorkbook();
    await buildComponentSheet(workbook, spec);

    expect(workbook.addWorksheet).toHaveBeenCalledWith("Компоненты");
    expect(workbook.sheets[0].tables[0].rows).toHaveLength(2);
  });

  it("keeps the customer's column order untouched", async () => {
    const workbook = createWorkbook();
    await buildComponentSheet(workbook, spec);

    const table = workbook.sheets[0].tables[0];
    expect(table.columns.map((column) => column.name)).toEqual(spec.headers);
    expect(table.rows[0]).toEqual([1, "Задвижка", "1"]);
  });

  it("adds no tab at all when the walk found nothing", async () => {
    // An empty tab would read as "the registry is empty" rather than "this
    // project has no registry".
    const workbook = createWorkbook();
    await buildComponentSheet(workbook, { ...spec, rows: [] });
    expect(workbook.addWorksheet).not.toHaveBeenCalled();
  });

  it("adds no tab for a project type without a registry", async () => {
    const workbook = createWorkbook();
    await buildComponentSheet(workbook, null);
    expect(workbook.addWorksheet).not.toHaveBeenCalled();
  });
});

describe("component rows", () => {
  it("numbers the rows and fills the declared columns", () => {
    const rows = buildComponentRows(
      [
        { component_uid: "7", component_name: "Задвижка" },
        { component_uid: "8", component_name: "Труба" },
      ],
      ["index", "component_uid", "component_name"],
    );

    expect(rows).toEqual([
      { index: 1, component_uid: "7", component_name: "Задвижка" },
      { index: 2, component_uid: "8", component_name: "Труба" },
    ]);
  });

  it("writes a blank for a field nobody could read off the plate", () => {
    // Two thirds of a card is expected to be empty; the export must not print
    // "undefined" across the sheet because of it.
    const [row] = buildComponentRows(
      [{ component_uid: "1" }],
      ["component_uid", "manufacturer", "working_pressure"],
    );

    expect(row.manufacturer).toBe("");
    expect(row.working_pressure).toBe("");
  });

  it("ignores columns the record knows nothing about", () => {
    const rows = buildComponentRows(undefined, ["index"]);
    expect(rows).toEqual([]);
  });
});
