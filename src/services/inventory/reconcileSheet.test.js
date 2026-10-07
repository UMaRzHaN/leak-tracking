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
});
