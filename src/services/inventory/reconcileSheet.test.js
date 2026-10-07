import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildReconcileRows, buildReconcileSheet } from "./reconcileSheet";

const texts = {
  sheet: "Сверка",
  unknownUser: "Не указан",
  headers: { round: "№ обхода", component_uid: "Номер", to: "Состояние" },
};

const inspect = (date, round, to = "В работе") => ({
  action: "component_inspected",
  date,
  user: "Азиз",
  to,
  ...(round ? { roundNumber: round } : {}),
});

const components = [
  {
    component_uid: "4242",
    scheme_tag: "ЗД1",
    component: "Задвижка",
    history: [
      { action: "component_created", date: "2026-08-01T09:00:00Z", user: "М" },
      inspect("2026-08-20T09:00:00Z"),
      inspect("2026-09-01T09:00:00Z", 3, "Требует замены"),
      inspect("2026-09-01T10:00:00Z", 3, "В работе"),
    ],
  },
];

describe("лист «Сверка»", () => {
  it("пишет строку на каждый осмотр с номером обхода", () => {
    const rows = buildReconcileRows(components, texts);
    expect(rows.map((row) => [row.round, row.to])).toEqual([
      ["", "В работе"],
      [3, "Требует замены"],
      [3, "В работе"],
    ]);
    expect(rows[0]).toMatchObject({ component_uid: "4242", scheme_tag: "ЗД1" });
  });

  it("в режиме «последняя в обходе» оставляет один осмотр на обход", () => {
    const rows = buildReconcileRows(components, texts, "latest_per_round");
    // Осмотр без номера остаётся, из двух осмотров обхода № 3 — последний.
    expect(rows.map((row) => [row.round, row.to])).toEqual([
      ["", "В работе"],
      [3, "В работе"],
    ]);
  });

  it("не заводит пустой лист, если осмотров не было", async () => {
    const workbook = new ExcelJS.Workbook();
    await buildReconcileSheet(workbook, {
      components: [{ component_uid: "1", history: [] }],
      texts,
    });
    expect(workbook.worksheets).toHaveLength(0);

    await buildReconcileSheet(workbook, { components, texts });
    expect(workbook.getWorksheet("Сверка").rowCount).toBe(4);
  });

  describe("снимки «до» и «после»", () => {
    const card = {
      id: "c1",
      component_uid: "4242",
      photo: "idb://card",
      history: [
        { ...inspect("2026-08-20T09:00:00Z"), photo: "idb://check-1" },
        { ...inspect("2026-09-01T09:00:00Z", 3), photo: "idb://check-2" },
      ],
    };
    // Та же карточка, как она уехала в архив.
    const archivedCard = {
      ...card,
      photo: "zip:Photos/4242.jpg",
      history: [
        { ...card.history[0], photo: "zip:Photos/4242_inspection_1.jpg" },
        { ...card.history[1], photo: "zip:Photos/4242_inspection_2.jpg" },
      ],
    };

    it("ссылаются на файлы архива: «до» — прошлая сверка или снимок карточки", () => {
      const rows = buildReconcileRows([card], texts, undefined, {
        archived: [archivedCard],
        archivedPhotos: [
          "Photos/4242.jpg",
          "Photos/4242_inspection_1.jpg",
          "Photos/4242_inspection_2.jpg",
        ],
      });

      expect(rows.map((row) => [row.previousPhotoLink, row.photoLink])).toEqual(
        [
          ["Photos/4242.jpg", "Photos/4242_inspection_1.jpg"],
          ["Photos/4242_inspection_1.jpg", "Photos/4242_inspection_2.jpg"],
        ],
      );
    });

    it("не ссылается на то, что в архив не легло", () => {
      const rows = buildReconcileRows([card], texts, undefined, {
        archived: [archivedCard],
        archivedPhotos: ["Photos/4242_inspection_2.jpg"],
      });
      expect(rows[1].previousPhotoLink).toBeNull();
      expect(rows[1].photoLink).toBe("Photos/4242_inspection_2.jpg");

      // Без архивной копии — ни одной ссылки на хранилище устройства.
      const local = buildReconcileRows([card], texts);
      expect(
        local.every((row) => !row.photoLink && !row.previousPhotoLink),
      ).toBe(true);
    });

    it("пишет ссылку в ячейку листа", async () => {
      const workbook = new ExcelJS.Workbook();
      await buildReconcileSheet(workbook, {
        components: [card],
        texts: {
          ...texts,
          headers: {
            ...texts.headers,
            photo: "Фото",
            previousPhoto: "Фото до",
          },
          photoOpen: "Открыть фото",
          photoMissing: "Есть (файл не найден)",
        },
        archived: [archivedCard],
        archivedPhotos: ["Photos/4242_inspection_1.jpg"],
      });

      const sheet = workbook.getWorksheet("Сверка");
      const header = sheet.getRow(1).values;
      expect(sheet.getRow(2).getCell(header.indexOf("Фото")).value).toEqual({
        text: "Открыть фото",
        hyperlink: "Photos/4242_inspection_1.jpg",
      });
      expect(sheet.getRow(2).getCell(header.indexOf("Фото до")).value).toBe(
        "Есть (файл не найден)",
      );
    });
  });
});
