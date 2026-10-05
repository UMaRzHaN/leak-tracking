import { beforeEach, describe, expect, it } from "vitest";
import {
  isReconciled,
  readReconcileRound,
  startReconcileRound,
} from "./reconcileRound";

describe("reconcile round", () => {
  beforeEach(() => localStorage.clear());

  it("numbers rounds per project and survives a reload", () => {
    expect(readReconcileRound("p1")).toBeNull();
    startReconcileRound("p1", Date.parse("2026-03-12T09:00:00Z"));
    const second = startReconcileRound(
      "p1",
      Date.parse("2026-10-05T09:00:00Z"),
    );

    expect(second.number).toBe(2);
    expect(readReconcileRound("p1")).toEqual(second);
    expect(readReconcileRound("p2")).toBeNull();
  });

  it("counts a component reconciled once inspected after the start", () => {
    const round = { number: 1, startedAt: "2026-10-05T09:00:00.000Z" };
    expect(isReconciled({ inspected_at: "2026-10-05T09:40:00Z" }, round)).toBe(
      true,
    );
    expect(isReconciled({ inspected_at: "2026-10-04T09:40:00Z" }, round)).toBe(
      false,
    );
    expect(isReconciled({}, round)).toBe(false);
    expect(isReconciled({ inspected_at: "2026-10-05T09:40:00Z" }, null)).toBe(
      false,
    );
  });
});
