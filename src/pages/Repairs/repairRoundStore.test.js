import { beforeEach, describe, expect, it } from "vitest";
import { repairsToCheck } from "./repairRoundStore";

const resolvedBefore = {
  id: "before",
  status: "resolved",
  events: [{ id: "d", type: "repair_done", date: "2026-09-20T10:00:00Z" }],
};
const inRepair = {
  id: "work",
  status: "in_progress",
  events: [{ id: "s", type: "repair_started", date: "2026-09-21T10:00:00Z" }],
};

describe("repairsToCheck", () => {
  beforeEach(() => localStorage.clear());

  it("без идущего обхода перепроверить можно и принятый", () => {
    expect(
      repairsToCheck("p1", [resolvedBefore, inRepair]).map((leak) => leak.id),
    ).toEqual(["before", "work"]);
  });

  it("в идущем обходе — кроме принятых до его начала", () => {
    localStorage.setItem(
      "app:p1:repair_round_v1",
      JSON.stringify({ number: 2, startedAt: "2026-10-01T00:00:00.000Z" }),
    );
    expect(
      repairsToCheck("p1", [resolvedBefore, inRepair]).map((leak) => leak.id),
    ).toEqual(["work"]);
  });
});
