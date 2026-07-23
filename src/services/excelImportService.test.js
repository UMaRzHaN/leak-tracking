import { describe, expect, it, vi } from "vitest";

import {
  parseExcelImportFile,
  parseExcelLeaks,
  persistExcelImportPhotos,
  reconcileExcelImportPhotos,
} from "./excelImportService";

async function makeWorkbookBlob(rows) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leaks");
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    arrayBuffer: async () => buffer,
  };
}

describe("parseExcelLeaks", () => {
  it("skips duplicate tags case-insensitively", async () => {
    const blob = await makeWorkbookBlob([
      ["Leak ID", "component"],
      ["TAG-1", "First valve"],
      [" tag-1 ", "Duplicate valve"],
    ]);

    const result = await parseExcelLeaks(blob);

    expect(result.leaks).toHaveLength(1);
    expect(result.leaks[0].component).toBe("First valve");
    expect(result.stats).toMatchObject({
      imported: 1,
      skipped: 1,
      duplicateLeakIds: 1,
    });
  }, 15_000);

  it("drops out-of-range coordinates without dropping the rest of the row", async () => {
    const blob = await makeWorkbookBlob([
      ["Leak ID", "latitude", "longitude", "component"],
      ["BAD-GPS", 91, -181, "Valve"],
    ]);

    const result = await parseExcelLeaks(blob);

    expect(result.leaks[0]).toMatchObject({
      leak_id: "BAD-GPS",
      component: "Valve",
    });
    expect(result.leaks[0]).not.toHaveProperty("lat");
    expect(result.leaks[0]).not.toHaveProperty("lng");
  });

  it("rejects impossible dates and preserves ISO calendar dates across timezones", async () => {
    const blob = await makeWorkbookBlob([
      ["Leak ID", "date", "component"],
      ["BAD-DATE", "31.02.2026", "Valve"],
      ["TZ-DATE", "2026-07-14T23:00:00-05:00", "Flange"],
    ]);

    const result = await parseExcelLeaks(blob);
    const invalid = result.leaks.find((leak) => leak.leak_id === "BAD-DATE");
    const timezone = result.leaks.find((leak) => leak.leak_id === "TZ-DATE");

    expect(invalid.date).not.toBe("03.03.2026");
    expect(timezone.date).toBe("14.07.2026");
  });

  it("imports a partially filled meaningful row and skips a status-only row", async () => {
    const blob = await makeWorkbookBlob([
      ["Leak ID", "status", "component"],
      ["", "", "Valve only"],
      ["", "Resolved", ""],
    ]);

    const result = await parseExcelLeaks(blob);

    expect(result.leaks).toHaveLength(1);
    expect(result.leaks[0].component).toBe("Valve only");
    expect(result.stats.skipped).toBe(1);
  });

  it("imports a legacy sheet with Russian headers after a title row", async () => {
    const blob = await makeWorkbookBlob([
      ["Старый отчёт LDAR"],
      [
        "ID утечки",
        "Дата",
        "Статус",
        "Скорость утечки",
        "Широта",
        "Долгота",
        "Объект",
      ],
      ["L-001", "14.07.2026", "В ремонте", "12,5", 41.2, 69.3, "КС-1"],
      ["", "", "", "", "", "", ""],
    ]);

    const result = await parseExcelLeaks(blob, { projectType: "upstream" });

    expect(result.stats).toMatchObject({
      totalRows: 1,
      imported: 1,
      skipped: 0,
    });
    expect(result.leaks[0]).toMatchObject({
      leak_id: "L-001",
      date: "14.07.2026",
      status: "in_progress",
      leak_speed: 12.5,
      lat: 41.2,
      lng: 69.3,
      object: "КС-1",
      priority: "medium",
    });
  }, 15_000);

  it("imports app-like Excel headers and defaults unknown statuses to open", async () => {
    const blob = await makeWorkbookBlob([
      ["Leak ID", "date", "status", "component", "leak_speed"],
      ["A-42", new Date(2026, 6, 14), "unknown", "Valve", 3],
    ]);

    const result = await parseExcelLeaks(blob, { projectType: "upstream" });

    expect(result.stats.imported).toBe(1);
    expect(result.leaks[0]).toMatchObject({
      leak_id: "A-42",
      date: "14.07.2026",
      status: "open",
      component: "Valve",
      leak_speed: 3,
      priority: "low",
    });
    expect(result.leaks[0].history).toEqual([
      expect.objectContaining({ action: "created" }),
    ]);
  });

  it("combines separate date and time columns into the creation timestamp", async () => {
    const blob = await makeWorkbookBlob([
      ["Бирка", "Дата", "Время", "Статус"],
      ["T-14", "14.07.2026", "13:45:12", "Открыта"],
    ]);

    const result = await parseExcelLeaks(blob, { projectType: "upstream" });
    const createdAt = new Date(result.leaks[0].createdAt);

    expect(result.leaks[0]).toMatchObject({
      leak_id: "T-14",
      date: "14.07.2026",
    });
    expect(result.leaks[0]).not.toHaveProperty("time");
    expect([
      createdAt.getFullYear(),
      createdAt.getMonth(),
      createdAt.getDate(),
      createdAt.getHours(),
      createdAt.getMinutes(),
      createdAt.getSeconds(),
    ]).toEqual([2026, 6, 14, 13, 45, 12]);
    expect(result.leaks[0].history[0].date).toBe(createdAt.toISOString());
  });

  it("restores app history records from the History sheet", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const leaksSheet = workbook.addWorksheet("Leaks");
    leaksSheet.addRow([
      "Leak ID",
      "date",
      "status",
      "component",
      "leak_speed",
      "Detected by",
    ]);
    leaksSheet.addRow([
      "TAG-9",
      "14.07.2026",
      "Open",
      "Valve",
      15,
      "Inspector",
    ]);

    const historySheet = workbook.addWorksheet("Leak History");
    historySheet.addRow([
      "Tag",
      "Date",
      "Time",
      "Action",
      "User",
      "Text",
      "Status",
      "Changes JSON",
    ]);
    historySheet.addRow([
      "TAG-9",
      "14.07.2026",
      "12:34:56",
      "edited",
      "",
      "",
      "",
      JSON.stringify([{ key: "leak_speed", from: 10, to: 15 }]),
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const result = await parseExcelLeaks(
      { arrayBuffer: async () => buffer },
      { projectType: "upstream" },
    );

    expect(result.stats.historyRecords).toBe(1);
    expect(result.leaks[0].history).toHaveLength(1);
    expect(result.leaks[0].history[0]).toMatchObject({
      action: "edited",
      user: "Inspector",
      changes: [{ key: "leak_speed", from: 10, to: 15 }],
    });
    const importedDate = new Date(result.leaks[0].history[0].date);
    expect([
      importedDate.getFullYear(),
      importedDate.getMonth(),
      importedDate.getDate(),
      importedDate.getHours(),
      importedDate.getMinutes(),
      importedDate.getSeconds(),
    ]).toEqual([2026, 6, 14, 12, 34, 56]);
  });

  it("keeps history empty when the app History sheet has no records", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const leaksSheet = workbook.addWorksheet("Leaks");
    leaksSheet.addRow(["Leak ID", "date", "status"]);
    leaksSheet.addRow(["TAG-EMPTY", "14.07.2026", "Open"]);

    const historySheet = workbook.addWorksheet("Leak History");
    historySheet.addRow(["Tag", "Date", "Action", "User"]);

    const buffer = await workbook.xlsx.writeBuffer();
    const result = await parseExcelLeaks(
      { arrayBuffer: async () => buffer },
      { projectType: "upstream" },
    );

    expect(result.stats.historyRecords).toBe(0);
    expect(result.leaks[0].history).toEqual([]);
  });

  it("attaches records from the app Monitoring sheet and infers current round", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const leaksSheet = workbook.addWorksheet("Leaks");
    leaksSheet.addRow(["Leak ID", "date", "status", "component", "leak_speed"]);
    leaksSheet.addRow(["TAG-7", "14.07.2026", "Open", "Valve", 15]);

    const monitoringSheet = workbook.addWorksheet("Мониторинг");
    monitoringSheet.addRow([
      "№",
      "Бирка",
      "Обход",
      "Дата мониторинга",
      "Время мониторинга",
      "Кто мониторил",
      "Результат",
      "МТР",
      "Комментарий",
    ]);
    monitoringSheet.addRow([
      1,
      "TAG-7",
      4,
      "15.07.2026",
      "16:27:43",
      "Алексей",
      "Утечка в ремонте",
      "Лента ФУМ",
      "Проверка обхода 4",
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const result = await parseExcelLeaks(
      { arrayBuffer: async () => buffer },
      { projectType: "upstream" },
    );

    expect(result.stats.monitoringRecords).toBe(1);
    expect(result.monitoringRound).toMatchObject({
      id: "excel-round-4",
      number: 4,
    });
    expect(result.leaks[0].monitoringRecords).toHaveLength(1);
    expect(result.leaks[0].monitoringRecords[0]).toMatchObject({
      roundId: "excel-round-4",
      roundNumber: 4,
      monitoredBy: "Алексей",
      result: "needs_recheck",
      materials_equipment: "Лента ФУМ",
      comment: "Проверка обхода 4",
    });
    const monitoringDate = new Date(result.leaks[0].monitoringRecords[0].date);
    expect([
      monitoringDate.getFullYear(),
      monitoringDate.getMonth(),
      monitoringDate.getDate(),
      monitoringDate.getHours(),
      monitoringDate.getMinutes(),
      monitoringDate.getSeconds(),
    ]).toEqual([2026, 6, 15, 16, 27, 43]);
  });

  it("imports current states and legacy concise monitoring answers", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const leaksSheet = workbook.addWorksheet("Leaks");
    leaksSheet.addRow(["Leak ID", "date", "status", "component"]);
    leaksSheet.addRow(["TAG-YES", "14.07.2026", "Open", "Valve"]);
    leaksSheet.addRow(["TAG-NO", "14.07.2026", "Resolved", "Flange"]);
    leaksSheet.addRow(["TAG-PRESENT", "14.07.2026", "Open", "Pump"]);
    leaksSheet.addRow(["TAG-ABSENT", "14.07.2026", "Resolved", "Seal"]);

    const monitoringSheet = workbook.addWorksheet("Monitoring");
    monitoringSheet.addRow([
      "Tag",
      "Round",
      "Monitoring date",
      "Monitored by",
      "Утечка есть",
    ]);
    monitoringSheet.addRow(["TAG-YES", 1, "15.07.2026", "Inspector A", "Да"]);
    monitoringSheet.addRow(["TAG-NO", 1, "15.07.2026", "Inspector B", "Нет"]);
    monitoringSheet.addRow([
      "TAG-PRESENT",
      1,
      "15.07.2026",
      "Inspector C",
      "Утечка есть",
    ]);
    monitoringSheet.addRow([
      "TAG-ABSENT",
      1,
      "15.07.2026",
      "Inspector D",
      "Утечки нет",
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const result = await parseExcelLeaks({ arrayBuffer: async () => buffer });
    const byTag = new Map(result.leaks.map((leak) => [leak.leak_id, leak]));

    expect(byTag.get("TAG-YES").monitoringRecords[0].result).toBe(
      "still_leaking",
    );
    expect(byTag.get("TAG-NO").monitoringRecords[0].result).toBe("resolved");
    expect(byTag.get("TAG-PRESENT").monitoringRecords[0].result).toBe(
      "still_leaking",
    );
    expect(byTag.get("TAG-ABSENT").monitoringRecords[0].result).toBe(
      "resolved",
    );
  });
  it("imports app Excel ZIP photos from worksheet hyperlinks", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const { default: JSZip } = await import("jszip");

    const workbook = new ExcelJS.Workbook();
    const leaksSheet = workbook.addWorksheet("Утечки");
    leaksSheet.addRow(["Бирка", "Дата", "Статус", "Фото"]);
    leaksSheet.addRow(["TAG-9", "14.07.2026", "Открыта", ""]);
    leaksSheet.getRow(2).getCell(4).value = {
      text: "Открыть фото",
      hyperlink: "photos/TAG-9/TAG-9.jpg",
    };

    const monitoringSheet = workbook.addWorksheet("Мониторинг");
    monitoringSheet.addRow([
      "№",
      "Бирка",
      "Обход",
      "Дата мониторинга",
      "Кто мониторил",
      "Результат",
      "Фото мониторинга",
    ]);
    monitoringSheet.addRow([
      1,
      "TAG-9",
      2,
      "15.07.2026",
      "Ирина",
      "Утечка устранена",
      "",
    ]);
    monitoringSheet.getRow(2).getCell(7).value = {
      text: "Открыть фото",
      hyperlink: "photos/TAG-9/monitoring/TAG-9_monitoring_1.jpg",
    };

    const xlsx = await workbook.xlsx.writeBuffer();
    const zip = new JSZip();
    zip.file("report.xlsx", xlsx);
    zip.file(
      "excel-project.json",
      JSON.stringify({
        schemaVersion: 1,
        project: { name: "Archive project", type: "midstream" },
        config: "midstream",
      }),
    );
    zip.file("photos/TAG-9/TAG-9.jpg", "aGVsbG8=", { base64: true });
    zip.file("photos/TAG-9/monitoring/TAG-9_monitoring_1.jpg", "aGVsbG8=", {
      base64: true,
    });
    const zipBlob = await zip.generateAsync({ type: "blob" });
    Object.defineProperty(zipBlob, "name", { value: "report.zip" });

    const result = await parseExcelImportFile(zipBlob, {
      projectType: "upstream",
    });

    expect(result.stats.restoredPhotos).toBe(2);
    expect(result.project).toEqual({
      name: "Archive project",
      type: "midstream",
    });
    expect(result.leaks[0].photo).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.leaks[0].monitoringRecords[0].photo).toMatch(
      /^data:image\/jpeg;base64,/,
    );

    const savePhoto = vi
      .fn()
      .mockResolvedValueOnce("idb://main")
      .mockResolvedValueOnce("idb://monitoring");
    const persisted = await persistExcelImportPhotos(result.leaks, savePhoto);

    expect(savePhoto).toHaveBeenCalledTimes(2);
    expect(persisted[0].photo).toBe("idb://main");
    expect(persisted[0].monitoringRecords[0].photo).toBe("idb://monitoring");
  });

  it("restores the exact project snapshot embedded in the xlsx sheet", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const { default: JSZip } = await import("jszip");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Project Backup");
    const payload = {
      schemaVersion: 1,
      project: {
        name: "Portable project",
        type: "upstream",
        syncId: "sync-portable",
      },
      vars: { methaneDensity: 0.7 },
      settings: { hiddenFields: ["note"], updatedAt: 123 },
      monitoringRound: { id: "round-3", number: 3, startedAt: 100 },
      sync: { varsUpdatedAt: 500, tombstones: {} },
      leaks: [
        {
          id: 77,
          leak_id: "P-77",
          status: "open",
          component: "Valve",
          customBackupField: { exact: true },
          photo: "zip:photos/P-77/P-77.png",
          history: [{ action: "created", date: "2026-07-20T10:00:00.000Z" }],
        },
      ],
    };
    sheet.addRow(["LEAK_TRACKER_EXCEL_BACKUP", 1]);
    sheet.addRow(["Chunk", "Payload"]);
    sheet.addRow([1, JSON.stringify(payload)]);

    const xlsx = await workbook.xlsx.writeBuffer();
    const zip = new JSZip();
    zip.file("portable.xlsx", xlsx);
    zip.file("photos/P-77/P-77.png", "aGVsbG8=", { base64: true });
    const archive = await zip.generateAsync({ type: "blob" });
    Object.defineProperty(archive, "name", { value: "portable.zip" });

    const result = await parseExcelImportFile(archive);

    expect(result.portableArchive).toBe(true);
    expect(result.project).toMatchObject({
      name: "Portable project",
      type: "upstream",
      syncId: "sync-portable",
    });
    expect(result.vars).toEqual({ methaneDensity: 0.7 });
    expect(result.settings).toEqual({ hiddenFields: ["note"], updatedAt: 123 });
    expect(result.monitoringRound).toMatchObject({ number: 3 });
    expect(result.sync).toEqual({ varsUpdatedAt: 500, tombstones: {} });
    expect(result.leaks[0]).toMatchObject({
      id: 77,
      leak_id: "P-77",
      customBackupField: { exact: true },
    });
    expect(result.leaks[0].photo).toMatch(/^data:image\/png;base64,/);
  });
});

describe("reconcileExcelImportPhotos", () => {
  it("reuses identical stored photos and persists only changed photos", async () => {
    const getStoredPhoto = vi
      .fn()
      .mockImplementation(async (key) =>
        key === "before" ? new Blob(["same"], { type: "image/png" }) : null,
      );
    const incoming = [
      {
        id: "import-id",
        leak_id: 10,
        photo: "data:image/png;base64,c2FtZQ==",
        photo_after: "data:image/png;base64,bmV3",
      },
    ];
    const existing = [
      {
        id: "local-id",
        leak_id: 10,
        photo: "idb://before",
        photo_after: "idb://after",
      },
    ];

    const reconciled = await reconcileExcelImportPhotos(
      existing,
      incoming,
      getStoredPhoto,
    );

    expect(reconciled.leaks[0].photo).toBe("idb://before");
    expect(reconciled.leaks[0].photo_after).toMatch(/^data:image/);
    expect(reconciled.photos).toMatchObject({
      added: 0,
      reused: 1,
      replaced: 1,
      toSave: 1,
      total: 2,
    });

    const savePhoto = vi.fn().mockResolvedValue("idb://replacement");
    await persistExcelImportPhotos(reconciled.leaks, savePhoto);
    expect(savePhoto).toHaveBeenCalledTimes(1);
  });

  it("reuses a monitoring photo from the matching monitoring record", async () => {
    const photo = "data:image/jpeg;base64,bW9uaXRvcmluZw==";
    const result = await reconcileExcelImportPhotos(
      [
        {
          leak_id: "TAG-1",
          monitoringRecords: [
            {
              id: "local-round-1",
              date: Date.parse("2026-03-10T00:00:00.000Z"),
              result: "still_leaking",
              photo: "idb://monitoring",
            },
          ],
        },
      ],
      [
        {
          leak_id: "TAG-1",
          monitoringRecords: [
            {
              id: "excel-TAG-1-round-1-2",
              date: "2026-03-10T00:00:00.000Z",
              result: "still_leaking",
              photo,
            },
          ],
        },
      ],
      async () => new Blob(["monitoring"], { type: "image/jpeg" }),
    );

    expect(result.leaks[0].monitoringRecords[0].photo).toBe("idb://monitoring");
    expect(result.photos.reused).toBe(1);
    expect(result.photos.toSave).toBe(0);
  });

  it("falls back to monitoring order when legacy dates cannot be matched", async () => {
    const photo = "data:image/jpeg;base64,c2FtZQ==";
    const result = await reconcileExcelImportPhotos(
      [
        {
          leak_id: "TAG-2",
          monitoringRecords: [
            { date: "legacy date", photo: "idb://legacy-monitoring" },
          ],
        },
      ],
      [
        {
          leak_id: "TAG-2",
          monitoringRecords: [{ date: "2026-03-10T00:00:00.000Z", photo }],
        },
      ],
      async () => new Blob(["same"], { type: "image/jpeg" }),
    );

    expect(result.leaks[0].monitoringRecords[0].photo).toBe(
      "idb://legacy-monitoring",
    );
    expect(result.photos).toMatchObject({ reused: 1, replaced: 0 });
  });

  it("matches monitoring photos by content when dates and order are lossy", async () => {
    const result = await reconcileExcelImportPhotos(
      [
        {
          leak_id: "TAG-3",
          monitoringRecords: [
            { date: "2026-03-10T08:00:00.000Z", photo: "idb://first" },
            { date: "2026-03-10T09:00:00.000Z", photo: "idb://second" },
          ],
        },
      ],
      [
        {
          leak_id: "TAG-3",
          monitoringRecords: [
            {
              date: "2026-03-10T00:00:00.000Z",
              photo: "data:image/jpeg;base64,c2Vjb25k",
            },
            {
              date: "2026-03-10T00:00:00.000Z",
              photo: "data:image/jpeg;base64,Zmlyc3Q=",
            },
          ],
        },
      ],
      async (key) => new Blob([key], { type: "image/jpeg" }),
    );

    expect(
      result.leaks[0].monitoringRecords.map((record) => record.photo),
    ).toEqual(["idb://second", "idb://first"]);
    expect(result.photos).toMatchObject({ reused: 2, replaced: 0 });
  });

  it("preserves photos in occupied slots during a non-destructive merge", async () => {
    const result = await reconcileExcelImportPhotos(
      [
        {
          leak_id: "TAG-4",
          photo: "idb://local-main",
          monitoringRecords: [
            { date: "2026-03-10T08:00:00.000Z", photo: "idb://local-round" },
          ],
        },
      ],
      [
        {
          leak_id: "TAG-4",
          photo: "data:image/jpeg;base64,b3JpZ2luYWwtbWFpbg==",
          monitoringRecords: [
            {
              date: "10.03.2026",
              photo: "data:image/jpeg;base64,b3JpZ2luYWwtcm91bmQ=",
            },
          ],
        },
      ],
      async () => null,
      { preserveExisting: true },
    );

    expect(result.leaks[0].photo).toBe("idb://local-main");
    expect(result.leaks[0].monitoringRecords[0].photo).toBe(
      "idb://local-round",
    );
    expect(result.photos).toMatchObject({ reused: 2, replaced: 0, toSave: 0 });
  });
});
