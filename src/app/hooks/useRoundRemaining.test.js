import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRoundRemaining } from "./useRoundRemaining";

const startedAt = "2026-10-02T00:00:00.000Z";
const repairs = [
  // Отмечен до обхода — к проверке.
  {
    id: "due",
    status: "in_progress",
    events: [{ id: "s", type: "repair_started", date: "2026-10-01T08:00Z" }],
  },
  // Отмечен в обходе — проверен.
  {
    id: "checked",
    status: "in_progress",
    events: [
      { id: "s", type: "repair_started", date: "2026-10-01T08:00Z" },
      {
        id: "m",
        type: "repair_stage",
        stage: "in_repair",
        date: "2026-10-03T08:00Z",
      },
    ],
  },
];
const components = [
  { id: "c1", inspected_at: "2026-10-03T08:00:00Z" },
  { id: "c2", inspected_at: "2026-09-01T08:00:00Z" },
  { id: "c3" },
];

function remaining(module, overrides = {}) {
  return renderHook(() =>
    useRoundRemaining({
      module,
      page: "",
      projectId: "p1",
      leaks: repairs,
      components,
      monitoringDue: 7,
      ...overrides,
    }),
  ).result.current;
}

describe("useRoundRemaining", () => {
  beforeEach(() => localStorage.clear());

  it("в мониторинге — его остаток обхода", () => {
    expect(remaining("monitoring")).toBe(7);
  });

  it("в ремонтах — непроверенные в идущем обходе ремонтов", () => {
    localStorage.setItem(
      "app:p1:repair_round_v1",
      JSON.stringify({ number: 1, startedAt }),
    );
    expect(remaining("repairs")).toBe(1);
  });

  it("в инвентаризации — не сверенные в идущей сверке", () => {
    localStorage.setItem(
      "app:p1:reconcile_round_v1",
      JSON.stringify({ number: 1, startedAt }),
    );
    expect(remaining("inventory")).toBe(2);
  });

  it("без идущего обхода счётчика нет", () => {
    localStorage.setItem(
      "app:p1:repair_round_v1",
      JSON.stringify({ number: 1, startedAt, completedAt: startedAt }),
    );
    expect(remaining("repairs")).toBeNull();
    expect(remaining("inventory")).toBeNull();
    expect(remaining("ldar")).toBeNull();
  });
});
