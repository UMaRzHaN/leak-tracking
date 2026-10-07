import { describe, expect, it } from "vitest";
import { getRepairLogExportRows } from "./repairLogRows";
import { getRepairExportRows } from "./repairRows";

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
});
