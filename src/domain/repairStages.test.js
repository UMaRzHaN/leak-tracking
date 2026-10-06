import { describe, expect, it } from "vitest";
import {
  REPAIR_STAGE,
  countRepairStages,
  getRepairBrigade,
  getRepairLeaks,
  getRepairStage,
  markRepairStage,
} from "./repairStages";

const started = (date) => ({ id: `s-${date}`, type: "repair_started", date });
const done = (date) => ({ id: `d-${date}`, type: "repair_done", date });
const stage = (value, date, extra = {}) => ({
  id: `m-${date}`,
  type: "repair_stage",
  stage: value,
  date,
  ...extra,
});

describe("getRepairStage", () => {
  it("treats a fresh repair as in progress until it is marked", () => {
    expect(
      getRepairStage({
        status: "in_progress",
        events: [started("2026-10-01")],
      }),
    ).toBe(REPAIR_STAGE.IN_REPAIR);
  });

  it("follows the latest mark of the current repair only", () => {
    const leak = {
      status: "in_progress",
      events: [
        started("2026-09-01"),
        stage("ready", "2026-09-02"),
        done("2026-09-03"),
        started("2026-10-01"),
        stage("waiting_mtr", "2026-10-02"),
      ],
    };
    expect(getRepairStage(leak)).toBe(REPAIR_STAGE.WAITING_MTR);
  });

  it("calls a resolved leak with a repair accepted and an open one waiting", () => {
    expect(
      getRepairStage({
        status: "resolved",
        events: [started("2026-10-01"), done("2026-10-02")],
      }),
    ).toBe(REPAIR_STAGE.ACCEPTED);
    expect(getRepairStage({ status: "resolved", events: [] })).toBeNull();
    // Открытая утечка — ремонт по ней не начат, она ждёт МТР.
    expect(getRepairStage({ status: "open" })).toBe(REPAIR_STAGE.WAITING_MTR);
  });
});

describe("repair lists", () => {
  const leaks = [
    { id: "a", status: "in_progress", events: [started("2026-10-01")] },
    {
      id: "b",
      status: "in_progress",
      events: [started("2026-10-01"), stage("ready", "2026-10-02")],
    },
    { id: "c", status: "open" },
    {
      id: "d",
      status: "resolved",
      events: [started("2026-10-01"), done("2026-10-03")],
    },
  ];

  it("collects repairs and counts them by stage", () => {
    expect(getRepairLeaks(leaks).map((leak) => leak.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(countRepairStages(leaks)).toMatchObject({
      all: 4,
      in_repair: 1,
      ready: 1,
      accepted: 1,
      waiting_mtr: 1,
    });
  });
});

describe("markRepairStage", () => {
  const leak = {
    id: "a",
    status: "in_progress",
    events: [started("2026-10-01")],
  };

  it("records the stage with the brigade and moves the leak along", () => {
    const now = Date.parse("2026-10-05T10:20:00Z");
    const marked = markRepairStage(
      leak,
      { stage: "ready", brigade: " Бригада 2 ", note: "Прокладка заменена" },
      { user: "Иван", now },
    );

    expect(getRepairStage(marked)).toBe(REPAIR_STAGE.READY);
    expect(getRepairBrigade(marked)).toBe("Бригада 2");
    expect(marked.events[marked.events.length - 1]).toMatchObject({
      user: "Иван",
      note: "Прокладка заменена",
    });
    expect(marked.updatedAt).toBe(now);
  });

  it("refuses to mark outside a repair or to accept by a mark", () => {
    expect(() =>
      markRepairStage({ status: "open" }, { stage: "ready" }),
    ).toThrow();
    expect(() => markRepairStage(leak, { stage: "accepted" })).toThrow();
  });
});
