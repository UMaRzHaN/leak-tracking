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
  getRepairStage,
  markRepairStage,
} from "./repairStages";
import { startLeakRepair } from "./leakLifecycle";

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
      expect(getRepairStage(next)).toBe(REPAIR_STAGE.ACCEPTED);
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
});
