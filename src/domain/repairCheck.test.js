import { describe, expect, it } from "vitest";
import { STATUS } from "@/utils/status";
import {
  REPAIR_CHECK_OUTCOME,
  applyRepairCheck,
  repairCheckOutcome,
} from "./repairCheck";
import {
  REPAIR_STAGE,
  getRepairBrigade,
  getRepairLog,
  getRepairStage,
  markRepairStage,
} from "./repairStages";
import { startLeakRepair } from "./leakLifecycle";
import { getLastMonitoringFlag, isLeakFiction } from "@/utils/monitoring";

const NOW = Date.UTC(2026, 9, 6, 12);
const open = { id: "a", leak_id: "1038", status: STATUS.OPEN, history: [] };
const inRepair = startLeakRepair(open, {}, { user: "Ким", now: NOW - 1000 });

describe("repairCheckOutcome", () => {
  it("maps the two answers to where the record goes", () => {
    expect(repairCheckOutcome({ leaking: false, done: true })).toBe(
      REPAIR_CHECK_OUTCOME.RESOLVED,
    );
    expect(repairCheckOutcome({ leaking: false, done: false })).toBe(
      REPAIR_CHECK_OUTCOME.RESOLVED,
    );
    expect(repairCheckOutcome({ leaking: true, done: true })).toBe(
      REPAIR_CHECK_OUTCOME.IN_REPAIR,
    );
    expect(repairCheckOutcome({ leaking: true, done: false })).toBe(
      REPAIR_CHECK_OUTCOME.WAITING_MTR,
    );
  });
});

describe("open leaks in repairs", () => {
  it("are waiting for materials", () => {
    expect(getRepairStage(open)).toBe(REPAIR_STAGE.WAITING_MTR);
  });

  it("take a brigade and a note but no other stage", () => {
    const marked = markRepairStage(
      open,
      { stage: REPAIR_STAGE.WAITING_MTR, brigade: "Бригада 2" },
      { user: "Ким", now: NOW },
    );
    expect(getRepairBrigade(marked)).toBe("Бригада 2");
    expect(() =>
      markRepairStage(open, { stage: REPAIR_STAGE.READY }, { user: "Ким" }),
    ).toThrow();
  });
});

describe("applyRepairCheck", () => {
  const options = { user: "Ким", now: NOW };

  it("closes the repair when the leak is gone, even from open", () => {
    for (const leak of [open, inRepair]) {
      const next = applyRepairCheck(
        leak,
        {
          leaking: false,
          done: true,
          brigade: "Бригада 2",
          photo_after: "after.jpg",
        },
        options,
      );
      expect(next.status).toBe(STATUS.RESOLVED);
      expect(getRepairStage(next)).toBe(REPAIR_STAGE.RESOLVED);
      expect(getRepairBrigade(next)).toBe("Бригада 2");
    }
  });

  it("keeps or starts the repair when it was done but still leaks", () => {
    for (const leak of [open, inRepair]) {
      const next = applyRepairCheck(
        leak,
        { leaking: true, done: true, note: "Подтекает" },
        options,
      );
      expect(next.status).toBe(STATUS.IN_PROGRESS);
      expect(getRepairStage(next)).toBe(REPAIR_STAGE.IN_REPAIR);
    }
  });

  it("returns the leak to open when the repair was not done", () => {
    const next = applyRepairCheck(
      inRepair,
      { leaking: true, done: false, brigade: "Бригада 3" },
      options,
    );
    expect(next.status).toBe(STATUS.OPEN);
    expect(getRepairStage(next)).toBe(REPAIR_STAGE.WAITING_MTR);
    expect(getRepairBrigade(next)).toBe("Бригада 3");
    expect(next.history.at(-1)).toMatchObject({ to: STATUS.OPEN });

    const stillOpen = applyRepairCheck(
      open,
      { leaking: true, done: false },
      options,
    );
    expect(stillOpen.status).toBe(STATUS.OPEN);
  });

  it("moves the point to GPS coords and logs the edit after the check", () => {
    const next = applyRepairCheck(
      { ...inRepair, lat: 1, lng: 2, coords_accuracy: 40 },
      {
        leaking: true,
        done: true,
        coords: { lat: 41.5, lng: 69.25, accuracy: 4.6 },
      },
      options,
    );
    expect(next).toMatchObject({ lat: 41.5, lng: 69.25, coords_accuracy: 5 });
    expect(next.status).toBe(STATUS.IN_PROGRESS);
    expect(next.history.at(-1)).toMatchObject({
      action: "edited",
      changes: [
        expect.objectContaining({ key: "lat" }),
        expect.objectContaining({ key: "lng" }),
      ],
    });
  });

  it("keeps the physical tag answer on the check's own event", () => {
    const next = applyRepairCheck(
      inRepair,
      { leaking: true, done: true, physicalTag: false },
      options,
    );
    expect(getLastMonitoringFlag(next, "physicalTag")).toBe(false);
    const tagged = next.events.filter(
      (event) => typeof event.physicalTag === "boolean",
    );
    expect(tagged).toHaveLength(1);
    expect(inRepair.events ?? []).not.toContainEqual(tagged[0]);

    const answeredAgain = applyRepairCheck(
      next,
      { leaking: true, done: true, physicalTag: true },
      { ...options, now: (options.now ?? 0) + 60_000 },
    );
    expect(getLastMonitoringFlag(answeredAgain, "physicalTag")).toBe(true);
  });

  it("keeps the photo and materials of a check that leaves the repair open", () => {
    const next = applyRepairCheck(
      inRepair,
      {
        leaking: true,
        done: true,
        photo_after: "photos/r1_after.jpg",
        materials_equipment: "Прокладка × 2",
      },
      options,
    );
    expect(next.status).toBe(STATUS.IN_PROGRESS);
    expect(getRepairLog(next)[0]).toMatchObject({
      stage: REPAIR_STAGE.IN_REPAIR,
      photo: "photos/r1_after.jpg",
      materials: "Прокладка × 2",
    });
  });
});

describe("rechecking a closed repair", () => {
  const options = { user: "Ким", now: NOW + 5000 };
  const resolved = applyRepairCheck(
    inRepair,
    { leaking: false, done: true, photo_after: "photos/after.jpg" },
    { user: "Ким", now: NOW },
  );

  it("keeps it closed and records the check when the leak is gone", () => {
    const checked = applyRepairCheck(
      resolved,
      { leaking: false, done: true, brigade: "Бригада 3" },
      options,
    );
    expect(checked.status).toBe(STATUS.RESOLVED);
    expect(getRepairLog(checked)[0]).toMatchObject({
      kind: "repair_stage",
      stage: REPAIR_STAGE.RESOLVED,
      brigade: "Бригада 3",
      user: "Ким",
    });
  });

  it("reopens it back into repair when the leak is still there", () => {
    const back = applyRepairCheck(
      resolved,
      { leaking: true, done: true },
      options,
    );
    expect(back.status).toBe(STATUS.IN_PROGRESS);
    expect(getRepairLog(back)[0].stage).toBe(REPAIR_STAGE.IN_REPAIR);
  });

  it("settles a fiction: the check answers whether the repair is real", () => {
    const fiction = {
      ...resolved,
      events: [
        ...resolved.events,
        {
          id: "i",
          type: "inspection",
          result: "still_leaking",
          date: new Date(NOW + 1000).toISOString(),
          fiction: true,
        },
      ],
    };
    expect(isLeakFiction(fiction)).toBe(true);
    const confirmed = applyRepairCheck(
      fiction,
      { leaking: false, done: true },
      options,
    );
    expect(isLeakFiction(confirmed)).toBe(false);
    const reopened = applyRepairCheck(
      fiction,
      { leaking: true, done: true },
      options,
    );
    expect(isLeakFiction(reopened)).toBe(false);
    expect(reopened.status).toBe(STATUS.IN_PROGRESS);
  });

  it("reopens it as awaiting materials when the repair was not done", () => {
    const back = applyRepairCheck(
      resolved,
      { leaking: true, done: false },
      options,
    );
    expect(back.status).toBe(STATUS.OPEN);
    expect(getRepairLog(back)[0].stage).toBe(REPAIR_STAGE.WAITING_MTR);
  });
});

describe("checks during a repair round", () => {
  it("mark the events they leave with the round number", () => {
    const checked = applyRepairCheck(
      inRepair,
      { leaking: true, done: true, brigade: "Бригада 3" },
      { user: "Ким", now: NOW, roundNumber: 5 },
    );
    const before = new Set(inRepair.events.map((event) => event.id));
    const created = checked.events.filter((event) => !before.has(event.id));
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((event) => event.roundNumber === 5)).toBe(true);
    expect(
      checked.events
        .filter((event) => before.has(event.id))
        .some((event) => "roundNumber" in event),
    ).toBe(false);
  });
});

describe("журнал изменений", () => {
  const actions = (leak) => (leak.history ?? []).map((entry) => entry.action);

  it("проверка без смены статуса оставляет запись, как осмотр", () => {
    const checked = applyRepairCheck(
      inRepair,
      { leaking: true, done: true, note: "Подтянули хомут" },
      { user: "Ким", now: NOW },
    );

    expect(checked.status).toBe(STATUS.IN_PROGRESS);
    expect(checked.history.at(-1)).toMatchObject({
      action: "repair_check",
      to: STATUS.IN_PROGRESS,
      stage: REPAIR_STAGE.IN_REPAIR,
      user: "Ким",
      text: "Подтянули хомут",
    });
  });

  it("проверка со сменой статуса второй записи не пишет", () => {
    const closed = applyRepairCheck(
      inRepair,
      { leaking: false, done: true },
      { user: "Ким", now: NOW },
    );

    expect(closed.status).toBe(STATUS.RESOLVED);
    expect(actions(closed)).not.toContain("repair_check");
    expect(actions(closed)).toContain("status_changed");
  });
});
