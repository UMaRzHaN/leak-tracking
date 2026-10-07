import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  finishReconcileRound,
  isReconciled,
  mergeReconcileRound,
  mergeReconcileRoundWithChecks,
  moveReconcileChecksToRound,
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

const KEY = "app:p1:reconcile_round_v1";

describe("слияние сверки", () => {
  beforeEach(() => localStorage.clear());

  it("переносит осмотры слитой сверки в предыдущую", () => {
    const card = {
      id: "c1",
      history: [
        { action: "component_inspected", date: "2026-10-01", roundNumber: 4 },
        { action: "component_edited", date: "2026-10-02", roundNumber: 4 },
        { action: "component_inspected", date: "2026-09-01", roundNumber: 3 },
      ],
    };
    const untouched = { id: "c2", history: [] };

    const [moved, same] = moveReconcileChecksToRound([card, untouched], 4, 3);

    expect(moved.history.map((entry) => entry.roundNumber)).toEqual([3, 4, 3]);
    expect(same).toBe(untouched);
  });

  it("сначала пишет осмотры, потом сливает; не записались — сверка прежняя", async () => {
    const current = {
      number: 4,
      startedAt: "2026-10-01T00:00:00.000Z",
      previous: { number: 3, startedAt: "2026-09-01T00:00:00.000Z" },
    };
    localStorage.setItem(KEY, JSON.stringify(current));

    const failing = vi.fn(async () => {
      throw new Error("disk full");
    });
    await expect(
      mergeReconcileRoundWithChecks("p1", failing),
    ).rejects.toThrow();
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(current);

    const rewrite = vi.fn(async (recompute) => recompute([]));
    const merged = await mergeReconcileRoundWithChecks("p1", rewrite);
    expect(merged).toMatchObject({ number: 3 });
    expect(rewrite).toHaveBeenCalledTimes(1);
  });
});
