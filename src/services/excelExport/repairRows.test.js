import { describe, expect, it } from "vitest";
import { getRepairExportRows } from "./repairRows";

const event = (id, type, iso, user) => ({ id, type, date: iso, user });

describe("строки листа ремонтов", () => {
  it("нумерует попытки по каждой утечке отдельно", () => {
    const rows = getRepairExportRows([
      {
        index: 7,
        leak_id: "A-1",
        events: [
          event("a", "repair_started", "2026-08-01T08:00:00.000Z"),
          event("b", "repair_done", "2026-08-01T10:00:00.000Z"),
          event("c", "repair_started", "2026-08-03T08:00:00.000Z"),
          event("d", "repair_done", "2026-08-03T09:00:00.000Z"),
        ],
      },
      {
        index: 9,
        leak_id: "A-2",
        events: [event("e", "repair_started", "2026-08-04T08:00:00.000Z")],
      },
    ]);

    expect(rows.map((row) => [row.leak_id, row.attempt])).toEqual([
      ["A-1", 1],
      ["A-1", 2],
      ["A-2", 1],
    ]);
    expect(rows.map((row) => row.index)).toEqual([7, 7, 9]);
  });

  it("считает часы числом, с сотыми", () => {
    const rows = getRepairExportRows([
      {
        leak_id: "A-1",
        events: [
          event("a", "repair_started", "2026-08-01T08:00:00.000Z"),
          event("b", "repair_done", "2026-08-01T08:45:00.000Z"),
        ],
      },
    ]);

    expect(rows[0].durationHours).toBe(0.75);
  });

  it("оставляет часы пустыми у незакрытой попытки", () => {
    const rows = getRepairExportRows([
      {
        leak_id: "A-1",
        events: [event("a", "repair_started", "2026-08-01T08:00:00.000Z")],
      },
    ]);

    expect(rows[0]).toMatchObject({
      durationHours: "",
      resolvedAt: "",
      resolvedTime: "",
    });
  });

  it("переживает завершение без сохранившегося начала", () => {
    // Старая запись, у которой был только `resolvedAt`.
    const rows = getRepairExportRows([
      {
        leak_id: "A-1",
        events: [event("a", "repair_done", "2026-08-01T08:00:00.000Z", "Пётр")],
      },
    ]);

    expect(rows[0]).toMatchObject({
      attempt: 1,
      repairAt: "",
      durationHours: "",
      user: "Пётр",
    });
  });

  it("ничего не выдаёт по утечке без ремонтов", () => {
    expect(getRepairExportRows([{ leak_id: "A-1", status: "open" }])).toEqual(
      [],
    );
  });
});
