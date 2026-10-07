import { describe, expect, it } from "vitest";
import { getRepairLogExportRows } from "./repairLogRows";
import { getRepairExportRows } from "./repairRows";
import ExcelJS from "exceljs";
import { buildRepairLogSheet } from "./repairLogSheet";

const leak = {
  leak_id: "1038",
  status: "resolved",
  events: [
    {
      id: "s",
      type: "repair_started",
      date: "2026-10-01T08:00:00Z",
      user: "Ким",
    },
    {
      id: "m",
      type: "repair_stage",
      stage: "in_repair",
      date: "2026-10-02T08:00:00Z",
      brigade: "Бригада 2",
      note: "Хомут",
    },
    { id: "d", type: "repair_done", date: "2026-10-03T08:00:00Z" },
  ],
};

describe("repair sheets", () => {
  it("keeps one mark per repair per round in the latest-per-round mode", () => {
    const rechecked = {
      ...leak,
      status: "in_progress",
      events: [
        leak.events[0],
        { ...leak.events[1], roundNumber: 2 },
        {
          id: "m2",
          type: "repair_stage",
          stage: "waiting_mtr",
          date: "2026-10-02T09:00:00Z",
          roundNumber: 2,
        },
      ],
    };
    expect(
      getRepairLogExportRows([rechecked], "latest_per_round").map(
        (row) => row.event,
      ),
    ).toEqual(["repair_started", "waiting_mtr"]);
    expect(getRepairLogExportRows([rechecked], "full")).toHaveLength(3);
  });

  it("lists the repair log oldest first, one row per event", () => {
    const rows = getRepairLogExportRows([leak]);
    expect(rows.map((row) => row.event)).toEqual([
      "repair_started",
      "in_repair",
      "repair_done",
    ]);
    expect(rows[1]).toMatchObject({
      leak_id: "1038",
      brigade: "Бригада 2",
      note: "Хомут",
    });
  });

  it("names the crew of each repair attempt", () => {
    expect(getRepairExportRows([leak])[0].brigade).toBe("Бригада 2");
  });

  describe("снимки «до» и «после»", () => {
    const photographed = {
      leak_id: "1040",
      status: "resolved",
      photo: "idb://first",
      events: [
        { ...leak.events[0], photo: "idb://start" },
        { ...leak.events[2], photo: "idb://done" },
      ],
    };

    it("дают строке ключи карты: свой снимок и прежний", () => {
      const [started, done] = getRepairLogExportRows([photographed]);

      // «До» начала ремонта — снимок самой записи, под колонкой «Фото».
      expect(started).toMatchObject({
        previousPhoto: "idb://first",
        previousPhotoMapKey: "0:photo",
        photo: "idb://start",
        photoMapKey: "event:0:0",
      });
      // «До» приёмки — снимок начала, под его местом в ленте.
      expect(done).toMatchObject({
        previousPhotoMapKey: "event:0:0",
        photoMapKey: "event:0:1",
      });
    });

    it("ставят ссылку, где файл есть, и говорят словами, где нет", async () => {
      const workbook = new ExcelJS.Workbook();
      const sheetTexts = {
        sheets: { repairLog: "Журнал ремонтов" },
        // Подпись колонки — её ключ: так её и ищут ниже.
        repairLog: {
          headers: new Proxy({}, { get: (_, key) => String(key) }),
          events: {},
        },
        photo: { open: "Открыть фото", missing: "Есть (файл не найден)" },
      };
      await buildRepairLogSheet(workbook, [photographed], sheetTexts, "full", {
        "0:photo": "photos/report/1040/photo.jpg",
        "event:0:0": "photos/report/1040/repair.jpg",
      });

      const sheet = workbook.getWorksheet("Журнал ремонтов");
      const header = sheet.getRow(1).values;
      const before = header.indexOf("previousPhoto");
      const after = header.indexOf("photo");
      expect(sheet.getRow(2).getCell(before).value).toEqual({
        text: "Открыть фото",
        hyperlink: "photos/report/1040/photo.jpg",
      });
      expect(sheet.getRow(2).getCell(after).value).toMatchObject({
        hyperlink: "photos/report/1040/repair.jpg",
      });
      // Снимок приёмки в книгу не лёг — так и сказано.
      expect(sheet.getRow(3).getCell(after).value).toBe(
        "Есть (файл не найден)",
      );
    });
  });

  it("несёт номер обхода и ответы проверки, как лист обходов", async () => {
    const checked = {
      ...leak,
      status: "in_progress",
      events: [
        leak.events[0],
        {
          ...leak.events[1],
          roundNumber: 2,
          physicalTag: false,
          fiction: true,
        },
      ],
    };
    const [, mark] = getRepairLogExportRows([checked]);
    expect(mark).toMatchObject({
      roundNumber: 2,
      physicalTag: false,
      fiction: true,
    });

    const workbook = new ExcelJS.Workbook();
    await buildRepairLogSheet(
      workbook,
      [checked],
      {
        sheets: { repairLog: "Журнал ремонтов" },
        repairLog: {
          headers: new Proxy({}, { get: (_, key) => String(key) }),
          events: {},
        },
        monitoring: { flags: { yes: "Да", no: "Нет" } },
        photo: { open: "Открыть фото", missing: "Есть (файл не найден)" },
      },
      "full",
    );
    const sheet = workbook.getWorksheet("Журнал ремонтов");
    const header = sheet.getRow(1).values;
    const row = sheet.getRow(3);
    expect(row.getCell(header.indexOf("roundNumber")).value).toBe(2);
    expect(row.getCell(header.indexOf("physicalTag")).value).toBe("Нет");
    expect(row.getCell(header.indexOf("fiction")).value).toBe("Да");
    // У начала ремонта вопросов не было — клетки пустые.
    expect(sheet.getRow(2).getCell(header.indexOf("fiction")).value).toBe("");
  });
});
