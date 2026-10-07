import { beforeEach, describe, expect, it } from "vitest";
import { ROUND_KIND, blockingRound } from "./roundConflict";

const monitoring = (extra = {}) =>
  localStorage.setItem(
    "app:p1:monitoring_round_v2",
    JSON.stringify({
      id: "round-1",
      number: 3,
      startedAt: "2026-10-01T00:00:00.000Z",
      ...extra,
    }),
  );
const repairs = (extra = {}) =>
  localStorage.setItem(
    "app:p1:repair_round_v1",
    JSON.stringify({
      number: 2,
      startedAt: "2026-10-02T00:00:00.000Z",
      ...extra,
    }),
  );

describe("blockingRound", () => {
  beforeEach(() => localStorage.clear());

  it("не даёт начать обход ремонтов, пока идёт обход мониторинга", () => {
    monitoring();
    expect(blockingRound("p1", ROUND_KIND.REPAIRS)).toEqual({
      kind: ROUND_KIND.MONITORING,
      number: 3,
    });
  });

  it("и обход мониторинга — пока идёт обход ремонтов", () => {
    repairs();
    expect(blockingRound("p1", ROUND_KIND.MONITORING)).toEqual({
      kind: ROUND_KIND.REPAIRS,
      number: 2,
    });
  });

  it("завершённый обход другого модуля не мешает", () => {
    monitoring({ completedAt: "2026-10-03T00:00:00.000Z" });
    repairs({ completedAt: "2026-10-04T00:00:00.000Z" });
    expect(blockingRound("p1", ROUND_KIND.REPAIRS)).toBeNull();
    expect(blockingRound("p1", ROUND_KIND.MONITORING)).toBeNull();
  });

  it("свой идущий обход не мешает себе: «Новый обход» — его дело", () => {
    repairs();
    expect(blockingRound("p1", ROUND_KIND.REPAIRS)).toBeNull();
  });

  it("сверка инвентаризации — исключение и ничему не мешает", () => {
    localStorage.setItem(
      "app:p1:reconcile_round_v1",
      JSON.stringify({ number: 5, startedAt: "2026-10-01T00:00:00.000Z" }),
    );
    expect(blockingRound("p1", ROUND_KIND.REPAIRS)).toBeNull();
    expect(blockingRound("p1", ROUND_KIND.MONITORING)).toBeNull();
  });

  it("обходы другого проекта не в счёт, без проекта — тоже", () => {
    monitoring();
    expect(blockingRound("p2", ROUND_KIND.REPAIRS)).toBeNull();
    expect(blockingRound(null, ROUND_KIND.REPAIRS)).toBeNull();
  });
});
