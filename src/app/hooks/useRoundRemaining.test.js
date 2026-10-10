import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { componentRegistryWrapper } from "@/test/componentRegistry";
import { reconcileNeedsRegistry, useRoundRemaining } from "./useRoundRemaining";

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

function remaining(module, overrides = {}, registry = {}) {
  return renderHook(
    () =>
      useRoundRemaining({
        module,
        page: "",
        projectId: "p1",
        leaks: repairs,
        components,
        monitoringDue: 7,
        ...overrides,
      }),
    { wrapper: componentRegistryWrapper(registry) },
  ).result.current.remaining;
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

  it("остаток сверки для меню — и вне инвентаризации, пока меню открыто", () => {
    localStorage.setItem(
      "app:p1:reconcile_round_v1",
      JSON.stringify({ number: 1, startedAt }),
    );
    const reconcileDue = (menuOpen) =>
      renderHook(
        () =>
          useRoundRemaining({
            module: "ldar",
            page: "",
            menuOpen,
            projectId: "p1",
            leaks: [],
            components,
            monitoringDue: null,
          }),
        { wrapper: componentRegistryWrapper() },
      ).result.current.reconcileDue;

    expect(reconcileDue(true)).toBe(2);
    expect(reconcileDue(false)).toBeNull();
  });

  it("пока реестр не прочитан — не «0 к сверке», а без счётчика", () => {
    // Реестр читается по требованию: до прочтения список пуст, и остаток по
    // нему вышел бы нулём посреди идущей сверки.
    localStorage.setItem(
      "app:p1:reconcile_round_v1",
      JSON.stringify({ number: 1, startedAt }),
    );
    expect(
      remaining("inventory", { components: [] }, { loaded: false }),
    ).toBeNull();
  });

  it("реестр ради меню читается только при идущей сверке", () => {
    expect(reconcileNeedsRegistry(true, "ldar", "p1")).toBe(false);

    localStorage.setItem(
      "app:p1:reconcile_round_v1",
      JSON.stringify({ number: 1, startedAt }),
    );
    expect(reconcileNeedsRegistry(true, "ldar", "p1")).toBe(true);
    expect(reconcileNeedsRegistry(false, "inventory", "p1")).toBe(true);
    expect(reconcileNeedsRegistry(false, "ldar", "p1")).toBe(false);
  });
});
