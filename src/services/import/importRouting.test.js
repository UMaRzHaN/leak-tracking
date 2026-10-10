import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { detectImportKind } from "./importRouting";
import { inflatedArchive } from "@/test/zipBomb";

async function workbook(sheetNames) {
  const book = new ExcelJS.Workbook();
  for (const name of sheetNames) book.addWorksheet(name).addRow(["a"]);
  const buffer = await book.xlsx.writeBuffer();
  return new File([buffer], "book.xlsx");
}

async function archive(files) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return new File([await zip.generateAsync({ type: "blob" })], "a.zip");
}

describe("working out what an imported file is", () => {
  it("reads a leak report as a leak report even with a registry tab", async () => {
    // The leak workbook carries the registry as one of its sheets; that must
    // not send the whole report down the inventory route.
    const file = await workbook(["Утечки", "Компоненты"]);
    await expect(detectImportKind(file)).resolves.toMatchObject({
      kind: "excel",
    });
  });

  it("reads a workbook that holds only the registry as an inventory", async () => {
    const file = await workbook(["Inventorization"]);
    await expect(detectImportKind(file)).resolves.toMatchObject({
      kind: "inventory",
    });
  });

  it("still reads an inventory workbook that carries its own history", async () => {
    // У архива инвентаризации второй лист — «История», и он не должен уводить
    // книгу с маршрута реестра.
    const file = await workbook(["Inventorization", "История"]);
    await expect(detectImportKind(file)).resolves.toMatchObject({
      kind: "inventory",
    });
  });

  it("recognises a ZIP backup by the file the import actually reads", async () => {
    const file = await archive({
      "backup.json": "[]",
      "components.json": "[]",
    });
    await expect(detectImportKind(file)).resolves.toMatchObject({
      kind: "project",
    });
  });

  it("keeps a leak export archive out of the inventory route", async () => {
    // Отчёт по утечкам больше не везёт реестр, но архивы, выгруженные когда
    // он его вёз, никуда не делись: components.json рядом с книгой не должен
    // отправлять весь отчёт в инвентаризацию.
    const book = await workbook(["Утечки", "Компоненты"]);
    const file = await archive({
      "!Database_test.xlsx": await book.arrayBuffer(),
      "components.json": "[]",
    });
    await expect(detectImportKind(file)).resolves.toMatchObject({
      kind: "excel",
    });
  });

  it("recognises an inventory archive by the workbook inside it", async () => {
    const book = await workbook(["Inventorization"]);
    const file = await archive({
      "!Inventorization_test.xlsx": await book.arrayBuffer(),
      "components.json": "[]",
    });
    await expect(detectImportKind(file)).resolves.toMatchObject({
      kind: "inventory",
    });
  });

  it("says it cannot tell rather than guessing", async () => {
    const file = new File(["not a zip at all"], "notes.txt");
    await expect(detectImportKind(file)).resolves.toMatchObject({
      kind: "unknown",
    });
  });
});

describe("zip-бомба на входе", () => {
  // Определение формата — первое, что делается с любым файлом, поэтому лимиты
  // импорта должны действовать уже здесь, а не только в ветках разбора.
  it("отказывает книге, чей workbook.xml раздувается за лимит", async () => {
    const file = await inflatedArchive(
      { "xl/workbook.xml": '<sheet name="Inventorization"/>' },
      ["xl/workbook.xml"],
    );
    await expect(detectImportKind(file)).rejects.toThrow(/too large/);
  });

  it("отказывает архиву с раздутой вложенной книгой", async () => {
    const file = await inflatedArchive({ "report/book.xlsx": "x".repeat(64) }, [
      "report/book.xlsx",
    ]);
    await expect(detectImportKind(file)).rejects.toThrow(/too large/);
  });

  it("отказывает архиву, где раздутая запись лежит рядом непрочитанной", async () => {
    // Лимит на запись — и по заголовку тоже: раздутый файл где угодно в
    // архиве делает архив подозрительным целиком.
    const file = await inflatedArchive(
      { "backup.json": "{}", "junk.bin": "x" },
      ["junk.bin"],
    );
    await expect(detectImportKind(file)).rejects.toThrow(/too large/);
  });

  it("отказывает файлу больше гигабайта, не открывая его", async () => {
    const file = { size: 2 * 1024 * 1024 * 1024, arrayBuffer: vi.fn() };
    await expect(detectImportKind(/** @type {any} */ (file))).rejects.toThrow(
      /too large/,
    );
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("заглядывает только на один уровень вложенности", async () => {
    // Книги в книге не бывает; без этого ограничения zip-«квайн» раскрывал бы
    // себя бесконечно.
    const inventory = await workbook(["Inventorization"]);
    const middle = await archive({
      "inner.xlsx": await inventory.arrayBuffer(),
    });
    const outer = await archive({ "outer.xlsx": await middle.arrayBuffer() });
    await expect(detectImportKind(outer)).resolves.toEqual({
      kind: "excel",
      reason: "zipped-workbook",
    });
  });
});

describe("когда сорвался сам разбор", () => {
  it("не выдаёт отказ инструмента за непонятный файл", async () => {
    vi.resetModules();
    vi.doMock("jszip", () => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    const { detectImportKind: detect } = await import("./importRouting");

    // Сорвавшаяся загрузка jszip — это ошибка, а не вердикт о файле: иначе
    // исправный архив объявляется непонятным и человек ищет беду не там.
    await expect(
      detect(await archive({ "backup.json": "{}" })),
    ).rejects.toThrow();

    vi.doUnmock("jszip");
    vi.resetModules();
  });
});
