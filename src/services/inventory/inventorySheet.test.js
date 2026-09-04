import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { componentIdFromUid, parseInventorySheet } from "./inventorySheet";

const excel = {
  headers: [
    "№",
    "Наименование компонента",
    "Индивидуальный номер компонента",
    "Инвентаризационный номер на схеме",
  ],
  keysOrder: ["index", "component", "component_uid", "scheme_tag"],
};

async function sheetWith(name, rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(name);
  sheet.addRow(excel.headers);
  for (const row of rows) sheet.addRow(row);
  return book;
}

describe("reading an inventory out of a sheet", () => {
  it("turns rows into cards keyed by the number written on the equipment", async () => {
    const book = await sheetWith("Inventorization", [
      [1, "Задвижка", "4242", "ЗД32"],
    ]);

    const { components } = parseInventorySheet(book, excel, { now: 5 });

    expect(components).toEqual([
      {
        component: "Задвижка",
        component_uid: "4242",
        scheme_tag: "ЗД32",
        id: componentIdFromUid("4242"),
        updatedAt: 5,
      },
    ]);
  });

  it("drops the row number rather than storing a stale ordinal", async () => {
    const book = await sheetWith("Inventorization", [[7, "Кран", "1", "PG"]]);
    const { components } = parseInventorySheet(book, excel);
    expect(components[0]).not.toHaveProperty("index");
  });

  it("counts rows with no number instead of inventing one", async () => {
    // Without a number a row cannot be recognised on a second import, and
    // silently adding it again every time would double the registry.
    const book = await sheetWith("Inventorization", [[1, "Кран", "", "PG"]]);
    const { components, skipped } = parseInventorySheet(book, excel);
    expect(components).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  /*
   * Первая колонка реестра подписана «№», и пока нормализация её
   * вычёркивала, в карте заголовков заводился пустой ключ: распознанным
   * заголовком считалась любая пустая ячейка. Недозаполненная строка, которая
   * шире шапки, набирала таких «заголовков» больше, чем шапка — настоящих,
   * становилась шапкой сама, `component_uid` в ней не было, и лист
   * отбраковывался целиком.
   */
  it("does not mistake a wide row of blanks for the header row", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Inventorization");
    sheet.addRow(excel.headers);
    sheet.addRow([1, "Задвижка", "4242", "ЗД32"]);
    sheet.addRow([2, "", "", "", "", ""]);

    const { components } = parseInventorySheet(book, excel);

    expect(components.map((card) => card.component_uid)).toEqual(["4242"]);
  });

  it("finds the sheet under the customer's own tab name", async () => {
    const book = await sheetWith("Компоненты", [[1, "Кран", "9", "PG"]]);
    expect(parseInventorySheet(book, excel).components).toHaveLength(1);
  });

  it("finds a renamed sheet by the columns only a registry has", async () => {
    const book = await sheetWith("Лист1", [[1, "Кран", "9", "PG"]]);
    expect(parseInventorySheet(book, excel).components).toHaveLength(1);
  });

  it("reads nothing out of a workbook that is not a registry", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Утечки");
    sheet.addRow(["Номер утечки", "Статус"]);
    sheet.addRow(["L-1", "Открыта"]);
    expect(parseInventorySheet(book, excel).components).toHaveLength(0);
  });
});
