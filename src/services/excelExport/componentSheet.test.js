import { describe, expect, it, vi } from "vitest";
import {
  buildComponentRowIds,
  buildComponentRows,
  buildComponentSheet,
} from "@/services/excelExport/componentSheet";

function createWorkbook() {
  const sheets = [];
  return {
    sheets,
    addWorksheet: vi.fn((name) => {
      const columns = new Map();
      /** @type {any} */
      const sheet = {
        name,
        rows: [],
        tables: [],
        addTable: vi.fn((table) => sheet.tables.push(table)),
        cells: new Map(),
        getRow: vi.fn((rowNumber) => ({
          eachCell: vi.fn(),
          getCell: vi.fn((columnNumber) => {
            const key = `${rowNumber}:${columnNumber}`;
            if (!sheet.cells.has(key)) sheet.cells.set(key, {});
            return sheet.cells.get(key);
          }),
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

describe("the photo column", () => {
  const photoSpec = {
    name: "Inventorization",
    headers: ["№", "Индивидуальный номер компонента", "Фото"],
    keysOrder: ["index", "component_uid", "photo"],
    rows: [
      { index: 1, component_uid: "7", photo: "idb://photo_a" },
      { index: 2, component_uid: "8", photo: "idb://photo_gone" },
      { index: 3, component_uid: "9", photo: "" },
    ],
    ids: ["a", "b", "c"],
  };
  const texts = {
    photo: { open: "Открыть фото", missing: "Есть (файл не найден)" },
  };

  it("links to the picture lying next to the workbook", async () => {
    // Раньше в ячейку попадал сам путь хранения — читателю он не говорит
    // ничего, а на другом устройстве ещё и никуда не ведёт.
    const workbook = createWorkbook();
    await buildComponentSheet(workbook, photoSpec, {
      photoPaths: { a: "Photos/7.jpg" },
      texts,
    });

    const sheet = workbook.sheets[0];
    expect(sheet.tables[0].rows[0][2]).toBe("");
    expect(sheet.cells.get("2:3").value).toEqual({
      text: "Открыть фото",
      hyperlink: "Photos/7.jpg",
    });
  });

  it("says the picture is missing rather than leaving a blank", async () => {
    const workbook = createWorkbook();
    await buildComponentSheet(workbook, photoSpec, {
      photoPaths: { a: "Photos/7.jpg" },
      texts,
    });

    expect(workbook.sheets[0].cells.get("3:3").value).toBe(
      "Есть (файл не найден)",
    );
  });

  it("leaves a card that never had a photograph empty", async () => {
    const workbook = createWorkbook();
    await buildComponentSheet(workbook, photoSpec, {
      photoPaths: { a: "Photos/7.jpg" },
      texts,
    });

    expect(workbook.sheets[0].cells.get("4:3").value).toBe("");
  });

  it("carries the card ids beside the rows, not in them", () => {
    // Колонки с UUID в листе нет — читателю он не нужен, — а ссылке на снимок
    // нужно знать, чья это строка.
    const components = [{ id: "a" }, { id: "b" }];
    expect(buildComponentRowIds(components)).toEqual(["a", "b"]);
    expect(buildComponentRows(components, ["index"])[0]).toEqual({ index: 1 });
  });
});
