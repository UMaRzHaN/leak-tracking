import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  addInventoryBackupSheet,
  parseInventoryBackupSheet,
} from "./inventoryBackupSheet";

const texts = {
  sheet: "Реестр компонентов",
  note: "Сводка для просмотра.",
  fieldColumn: "Параметр",
  valueColumn: "Значение",
  summary: {
    components: "Компонентов",
    withPhoto: "Со снимком",
    version: "Версия резервной копии",
  },
};

const cards = [
  {
    id: "a",
    component_uid: "4242",
    component: "Задвижка",
    photo: "zip:Photos/4242.jpg",
    history: [{ action: "component_created", user: "Мухиддин" }],
  },
  { id: "b", component_uid: "4243", component: "Кран шаровой" },
];

async function roundTrip(input, sheetTexts = texts) {
  const workbook = new ExcelJS.Workbook();
  addInventoryBackupSheet(workbook, { data: input }, sheetTexts);
  const buffer = await workbook.xlsx.writeBuffer();

  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer);
  return { workbook: reopened, cards: parseInventoryBackupSheet(reopened) };
}

describe("реестр внутри самой книги", () => {
  it("возвращает карточки целиком — с историей и путём к снимку", async () => {
    // Ради этого он и появился: видимый лист — плоская таблица, из которой ни
    // истории, ни снимков не собрать.
    const { cards: restored } = await roundTrip(cards);

    expect(restored).toEqual(cards);
  });

  it("прячет служебные столбцы от того, кто открыл книгу", async () => {
    const { workbook } = await roundTrip(cards);
    const sheet = workbook.getWorksheet("Inventory Backup");

    expect(sheet.getColumn(1).hidden).toBe(true);
    expect(sheet.getColumn(2).hidden).toBe(true);
    // Рядом — сводка словами, чтобы страница не выглядела как испорченные данные.
    expect(sheet.getCell("C5").value).toBe("Компонентов");
    expect(sheet.getCell("D5").value).toBe(2);
    expect(sheet.getCell("D6").value).toBe(1);
  });

  it("не заводит лист у пустого реестра", async () => {
    const workbook = new ExcelJS.Workbook();
    addInventoryBackupSheet(workbook, { data: [] }, texts);

    expect(workbook.getWorksheet("Inventory Backup")).toBeUndefined();
  });

  it("молчит о чужой книге, а не выдаёт её за свою", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Inventory Backup").addRow(["чужое", 1]);

    expect(parseInventoryBackupSheet(workbook)).toBeNull();
  });

  it("говорит, что книга сломана, вместо половины реестра", async () => {
    const workbook = new ExcelJS.Workbook();
    addInventoryBackupSheet(workbook, { data: cards }, texts);
    const sheet = workbook.getWorksheet("Inventory Backup");
    sheet.getRow(3).getCell(2).value = "{сломано";

    expect(() => parseInventoryBackupSheet(workbook)).toThrow(/invalid data/);
  });

  it("переживает реестр, который не влезает в одну ячейку", async () => {
    // Ячейка Excel вмещает 32 767 знаков; обход месторождения — больше.
    const many = Array.from({ length: 400 }, (_, index) => ({
      id: `c${index}`,
      component_uid: String(index),
      component: "Задвижка механическая стальная с длинным наименованием",
    }));

    const { workbook, cards: restored } = await roundTrip(many);
    const sheet = workbook.getWorksheet("Inventory Backup");

    expect(restored).toHaveLength(400);
    expect(sheet.rowCount).toBeGreaterThan(4);
  });
});
