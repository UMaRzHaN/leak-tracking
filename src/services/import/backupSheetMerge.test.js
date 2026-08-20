import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { mergeSheetEditsIntoBackup } from "./backupSheetMerge";
import { parseExcelLeaks } from "./excelImportParse";
import { buildWorkbookBufferLocally } from "@/services/excelExport/buildWorkbookBuffer";
import { BACKUP_SCHEMA_VERSION } from "@/services/excelExport/backupSheet";
import { PROJECTS } from "@/configs/projects";

describe("mergeSheetEditsIntoBackup", () => {
  const backup = [
    {
      id: 11,
      leak_id: "TAG-1",
      component: "Задвижка",
      status: "open",
      leak_speed: 5,
      priority: "high",
      photo: "data:image/jpeg;base64,aGVsbG8=",
      history: [{ action: "created" }],
      monitoringRecords: [{ roundNumber: 1 }],
    },
  ];

  it("оставляет карточку нетронутой, когда таблицу не правили", () => {
    const merged = mergeSheetEditsIntoBackup(backup, [
      { leak_id: "TAG-1", component: "Задвижка", status: "open" },
    ]);

    expect(merged.edited).toBe(0);
    expect(merged.leaks[0]).toBe(backup[0]);
  });

  it("накладывает правку, не трогая снимок и историю", () => {
    const merged = mergeSheetEditsIntoBackup(backup, [
      {
        leak_id: "TAG-1",
        component: "ИСПРАВЛЕНО",
        // Ссылка из таблицы не должна вытеснить сам снимок из слепка.
        photo: "photos/TAG-1/before.jpg",
      },
    ]);

    expect(merged.edited).toBe(1);
    expect(merged.leaks[0]).toMatchObject({
      component: "ИСПРАВЛЕНО",
      photo: "data:image/jpeg;base64,aGVsbG8=",
      history: [{ action: "created" }],
      monitoringRecords: [{ roundNumber: 1 }],
    });
  });

  it("пустая ячейка не стирает того, что знает приложение", () => {
    const merged = mergeSheetEditsIntoBackup(backup, [
      { leak_id: "TAG-1", component: "", status: "   " },
    ]);

    expect(merged.edited).toBe(0);
    expect(merged.leaks[0].component).toBe("Задвижка");
  });

  it("даёт вычисленному полю пойти следом за своим источником", () => {
    const merged = mergeSheetEditsIntoBackup(backup, [
      { leak_id: "TAG-1", leak_speed: 0.2, priority: "low" },
    ]);

    expect(merged.leaks[0]).toMatchObject({ leak_speed: 0.2, priority: "low" });
  });

  it("не считает правкой ту же дату, записанную иначе", () => {
    const merged = mergeSheetEditsIntoBackup(
      [{ leak_id: "TAG-1", repairAt: "2026-08-17T00:00:00.000Z" }],
      [{ leak_id: "TAG-1", repairAt: new Date("2026-08-17T00:00:00.000Z") }],
    );

    expect(merged.edited).toBe(0);
  });

  it("дописанная в Excel строка становится новой утечкой", () => {
    const merged = mergeSheetEditsIntoBackup(backup, [
      { leak_id: "TAG-1", component: "Задвижка" },
      { leak_id: "TAG-NEW", component: "Дописана руками" },
    ]);

    expect(merged.added).toBe(1);
    expect(merged.leaks).toHaveLength(2);
    expect(merged.leaks[1].component).toBe("Дописана руками");
  });

  it("удалённая из таблицы строка остаётся, но её пересчитывают", () => {
    const merged = mergeSheetEditsIntoBackup(
      [...backup, { id: 12, leak_id: "TAG-2", component: "Регулятор" }],
      [{ leak_id: "TAG-1", component: "Задвижка" }],
    );

    expect(merged.leaks).toHaveLength(2);
    expect(merged.missing).toBe(1);
  });
});

describe("книга, вернувшаяся из Excel", () => {
  const leaks = [
    {
      id: 11,
      leak_id: "TAG-1",
      index: 1,
      component: "Задвижка",
      status: "open",
      address: "улица 1",
      leak_speed: 5.43,
      pressure: 3,
      date: "17.08.2026",
      created_at: "2026-08-17T00:00:00.000Z",
      createdAt: 1755388800000,
      updatedAt: 1755388800000,
      history: [],
      monitoringRecords: [],
    },
    {
      id: 12,
      leak_id: "TAG-2",
      index: 2,
      component: "Регулятор",
      status: "resolved",
      address: "улица 2",
      leak_speed: 1.03,
      pressure: 3,
      date: "17.08.2026",
      created_at: "2026-08-17T00:00:00.000Z",
      createdAt: 1755388800001,
      updatedAt: 1755388800001,
      history: [],
      monitoringRecords: [],
    },
  ];
  const { headers, keysOrder } = PROJECTS.downstream.export.excel;
  const texts = {
    sheets: { leaks: "Утечки", monitoring: "Мониторинг", history: "История" },
    backup: {
      title: "Резервная копия проекта",
      note: "",
      fieldColumn: "Параметр",
      valueColumn: "Значение",
      roundNumberFormat: '"№ "0',
      projectTypes: { upstream: "U", midstream: "M", downstream: "D" },
      summary: {
        project: "Проект",
        projectType: "Тип",
        exportedAt: "Выгружено",
        leaks: "Утечек",
        monitoringChecks: "Проверок",
        historyRecords: "Записей",
      },
    },
    monitoring: {},
    history: {},
  };

  /** Выгрузка настоящим сборщиком, правка в Excel и импорт обратно. */
  async function roundTrip(edit) {
    const buffer = await buildWorkbookBufferLocally({
      orderedLeaks: leaks,
      orderedRows: leaks.map((leak) =>
        Object.fromEntries(keysOrder.map((key) => [key, leak[key] ?? ""])),
      ),
      headers,
      keysOrder,
      photoMap: {},
      texts,
      monitoringExportMode: "all",
      archivePayload: {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        project: { name: "Проект", type: "downstream" },
        leaks,
      },
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    if (edit) edit(workbook.getWorksheet("Утечки"));
    const resaved = await workbook.xlsx.writeBuffer();

    return parseExcelLeaks(
      { arrayBuffer: async () => resaved },
      { projectType: "downstream" },
    );
  }

  it("проходит нетронутой без единой мнимой правки", async () => {
    const result = await roundTrip(null);

    expect(result.stats).toMatchObject({
      sheetEdited: 0,
      sheetAdded: 0,
      exactBackup: true,
    });
    expect(result.leaks).toHaveLength(2);
  }, 60_000);

  it("доносит правку, сделанную в ячейке", async () => {
    const column = keysOrder.indexOf("component") + 1;
    const result = await roundTrip((sheet) => {
      sheet.getRow(2).getCell(column).value = "ИСПРАВЛЕНО В EXCEL";
    });

    expect(result.stats).toMatchObject({ sheetEdited: 1, exactBackup: false });
    expect(result.leaks.map((leak) => leak.component)).toEqual([
      "ИСПРАВЛЕНО В EXCEL",
      "Регулятор",
    ]);
  }, 60_000);

  it("доносит строку, дописанную в конец таблицы", async () => {
    const tagColumn = keysOrder.indexOf("leak_id") + 1;
    const componentColumn = keysOrder.indexOf("component") + 1;
    const result = await roundTrip((sheet) => {
      const row = sheet.getRow(4);
      row.getCell(tagColumn).value = "TAG-3";
      row.getCell(componentColumn).value = "Дописана руками";
      row.commit();
    });

    expect(result.stats).toMatchObject({ sheetAdded: 1 });
    expect(result.leaks).toHaveLength(3);
    expect(result.leaks[2]).toMatchObject({
      leak_id: "TAG-3",
      component: "Дописана руками",
    });
  }, 60_000);
});
