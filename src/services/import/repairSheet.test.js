import { describe, expect, it } from "vitest";
import { parseRepairRecords } from "./repairSheetParser";
import { attachRepairEvents } from "./recordMerge";
import { findRepairSheet } from "./workbookSchema";

function makeSheet(name, rows) {
  return {
    name,
    rowCount: rows.length,
    getRow(rowNumber) {
      const values = rows[rowNumber - 1] ?? [];
      return {
        eachCell(_options, callback) {
          values.forEach((value, index) => {
            if (value != null && value !== "") callback({ value }, index + 1);
          });
        },
        getCell(columnNumber) {
          return { value: values[columnNumber - 1] };
        },
      };
    },
  };
}

const HEADERS = [
  "№",
  "Бирка",
  "Попытка",
  "Начат",
  "Время начала",
  "Завершён",
  "Время завершения",
  "Часов на ремонт",
  "Исполнитель",
  "МТР ремонта",
  "Примечание",
  "Фото начала",
  "Фото завершения",
];

const repairSheet = (rows) => makeSheet("Ремонты", [HEADERS, ...rows]);

/** Час, написанный в книге, — местный: в ISO он уходит по поясу читающего. */
const localIso = (year, month, day, hours, minutes) =>
  new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();

describe("лист ремонтов", () => {
  it("разбирает попытку в пару событий ленты", () => {
    const { eventsByLeakId, count } = parseRepairRecords(
      repairSheet([
        [
          1,
          "TAG-1",
          1,
          "16.09.2026",
          "02:30:00",
          "16.09.2026",
          "08:15:00",
          5.75,
          "Бригада",
          "Прокладка",
          "Заменили",
          "photos/TAG-1/events/event-1.jpg",
          "photos/TAG-1/events/event-2.jpg",
        ],
      ]),
    );

    const startedAt = localIso(2026, 9, 16, 2, 30);
    const doneAt = localIso(2026, 9, 16, 8, 15);

    expect(count).toBe(2);
    expect(eventsByLeakId.get("tag-1")).toEqual([
      {
        id: `TAG-1:repair_started:${startedAt}`,
        type: "repair_started",
        date: startedAt,
        user: "Бригада",
        photo: "zip:photos/TAG-1/events/event-1.jpg",
      },
      {
        id: `TAG-1:repair_done:${doneAt}`,
        type: "repair_done",
        date: doneAt,
        user: "Бригада",
        photo: "zip:photos/TAG-1/events/event-2.jpg",
        materials_equipment: "Прокладка",
        note: "Заменили",
      },
    ]);
  });

  it("берёт незаконченную починку и пропускает строку без начала", () => {
    const { eventsByLeakId, count } = parseRepairRecords(
      repairSheet([
        [2, "TAG-2", 1, "01.08.2026", "09:00:00"],
        [3, "TAG-3", 1, "", "", "02.08.2026", "10:00:00"],
      ]),
    );

    expect(count).toBe(1);
    expect(eventsByLeakId.get("tag-2")).toHaveLength(1);
    expect(eventsByLeakId.has("tag-3")).toBe(false);
  });

  it("находит лист по колонкам, даже если его переименовали", () => {
    const workbook = {
      worksheets: [
        makeSheet("Утечки", [
          ["№", "Бирка"],
          [1, "TAG-1"],
        ]),
        makeSheet("Sheet2", [HEADERS, [1, "TAG-1", 1, "01.08.2026", "09:00"]]),
      ],
    };

    expect(findRepairSheet(workbook)?.name).toBe("Sheet2");
  });
});

describe("события ремонта в ленте утечки", () => {
  const events = new Map([
    [
      "tag-1",
      [
        {
          id: "TAG-1:repair_started:2026-08-01T09:00:00.000Z",
          type: "repair_started",
          date: "2026-08-01T09:00:00.000Z",
        },
      ],
    ],
  ]);

  it("дописывает починку и держит ленту по времени", () => {
    const [leak] = attachRepairEvents(
      [
        {
          leak_id: "TAG-1",
          updatedAt: 1,
          events: [
            { id: "e0", type: "detected", date: "2026-07-01T00:00:00.000Z" },
          ],
        },
      ],
      events,
    );

    expect(leak.events.map((event) => event.type)).toEqual([
      "detected",
      "repair_started",
    ]);
    expect(leak.updatedAt).toBe(Date.parse("2026-08-01T09:00:00.000Z"));
  });

  it("не удваивает починку, уже стоящую в ленте", () => {
    const leak = {
      leak_id: "TAG-1",
      events: [...(events.get("tag-1") ?? [])],
    };

    const [merged] = attachRepairEvents([leak], events);

    expect(merged.events).toHaveLength(1);
  });
});
