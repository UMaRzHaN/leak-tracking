import { describe, expect, it } from "vitest";
import { isMonitoringDue } from "./monitoring";

describe("isMonitoringDue", () => {
  it("recognizes a legacy checked record by round number", () => {
    const leak = {
      monitoringRecords: [
        {
          date: "2026-07-14T07:00:00.000Z",
          roundNumber: 3,
        },
      ],
    };

    expect(isMonitoringDue(leak, "legacy-round-3", 3)).toBe(false);
    expect(isMonitoringDue(leak, "round-4", 4)).toBe(true);
  });

  it("prefers exact round ids for current records", () => {
    const leak = {
      monitoringRecords: [
        {
          date: "2026-07-14T07:00:00.000Z",
          roundId: "round-original",
          roundNumber: 3,
        },
      ],
    };

    expect(isMonitoringDue(leak, "round-original", 3)).toBe(false);
    expect(isMonitoringDue(leak, "round-other", 3)).toBe(true);
  });
});
