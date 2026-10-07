import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import {
  buildComponentHistoryRows,
  buildComponentHistorySheet,
} from "./componentHistorySheet";

const fields = [
  { key: "scheme_tag", label: "Инвентаризационный номер на схеме" },
  { key: "component_status", label: "Статус компонента" },
];

const texts = {
  sheet: "История",
  unknownUser: "Не указан",
  emptyValue: "—",
  actions: {
    created: "Карточка заведена",
    edited: "Правка",
    inspected: "Осмотр",
  },
  headers: {
    index: "№",
    component_uid: "Индивидуальный номер компонента",
    date: "Дата",
    time: "Время",
    action: "Действие",
    user: "Кто",
    to: "Состояние",
    changes: "Изменения",
  },
};

const walked = [
  {
    id: "a",
    component_uid: "4242",
    history: [
      {
        action: "component_created",
        date: "2026-08-19T10:00:00.000Z",
        user: "Мухиддин",
      },
      {
        action: "component_edited",
        date: "2026-08-19T11:00:00.000Z",
        user: "Мухиддин",
        changes: [{ key: "scheme_tag", from: "ЗД1", to: "ЗД99" }],
      },
      {
        action: "component_inspected",
        date: "2026-08-20T09:00:00.000Z",
        user: "Азиз",
        to: "Требует замены",
        changes: [
          { key: "component_status", from: "В работе", to: "Требует замены" },
        ],
      },
    ],
  },
];

describe("история реестра строками", () => {
  it("пишет по строке на событие, подписанное человеком", () => {
    const rows = buildComponentHistoryRows(walked, fields, texts);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      index: 1,
      component_uid: "4242",
      action: "Карточка заведена",
      user: "Мухиддин",
    });
  });

  it("рассказывает изменение словами, а не ключом поля", () => {
    // Лист читают глазами; JSON с историей лежит рядом, в components.json.
    const rows = buildComponentHistoryRows(walked, fields, texts);

    expect(rows[1].changes).toBe(
      "Инвентаризационный номер на схеме: ЗД1 → ЗД99",
    );
    expect(rows[2].changes).toBe(
      "Статус компонента: В работе → Требует замены",
    );
    expect(rows[2].to).toBe("Требует замены");
  });

  it("ставит прочерк там, где значения не было", () => {
    const rows = buildComponentHistoryRows(
      [
        {
          component_uid: "1",
          history: [
            {
              action: "component_edited",
              date: "2026-08-19T10:00:00.000Z",
              user: "Мухиддин",
              changes: [{ key: "scheme_tag", from: null, to: "ЗД1" }],
            },
          ],
        },
      ],
      fields,
      texts,
    );

    expect(rows[0].changes).toBe("Инвентаризационный номер на схеме: — → ЗД1");
  });

  it("не оставляет запись без подписи, даже пришедшую из старой сборки", () => {
    const rows = buildComponentHistoryRows(
      [{ component_uid: "1", history: [{ action: "component_created" }] }],
      fields,
      texts,
    );

    expect(rows[0].user).toBe("Не указан");
  });

  it("добавляет лист в книгу", async () => {
    const workbook = new ExcelJS.Workbook();
    await buildComponentHistorySheet(workbook, {
      components: walked,
      fields,
      texts,
    });

    const sheet = workbook.getWorksheet("История");
    expect(sheet).toBeTruthy();
    expect(sheet.rowCount).toBe(4);
  });

  it("не заводит пустую вкладку у обхода, который ещё никто не правил", async () => {
    const workbook = new ExcelJS.Workbook();
    const addWorksheet = vi.spyOn(workbook, "addWorksheet");

    await buildComponentHistorySheet(workbook, {
      components: [{ component_uid: "1", history: [] }],
      fields,
      texts,
    });

    expect(addWorksheet).not.toHaveBeenCalled();
  });
});
