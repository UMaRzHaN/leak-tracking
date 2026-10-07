import { beforeEach, describe, expect, it } from "vitest";
import {
  finishReconcileRound,
  isReconciled,
  mergeReconcileRound,
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

  it("finishes a round and merges a mistaken one into the previous", () => {
    const first = startReconcileRound("p1", Date.parse("2026-10-01T09:00:00Z"));
    expect(mergeReconcileRound("p1")).toBeNull();

    startReconcileRound("p1", Date.parse("2026-10-05T09:00:00Z"));
    const merged = mergeReconcileRound("p1");
    expect(merged).toEqual({ number: 1, startedAt: first.startedAt });
    expect(readReconcileRound("p1")).toEqual(merged);
    // Осмотр в ошибочной сверке засчитан в предыдущей.
    expect(isReconciled({ inspected_at: "2026-10-05T10:00:00Z" }, merged)).toBe(
      true,
    );

    const done = finishReconcileRound("p1", Date.parse("2026-10-06T09:00:00Z"));
    expect(done.completedAt).toBe("2026-10-06T09:00:00.000Z");
    expect(startReconcileRound("p1").number).toBe(2);
    // Завершённую сверку не сливают.
    finishReconcileRound("p1");
    expect(mergeReconcileRound("p1")).toBeNull();
  });
});
