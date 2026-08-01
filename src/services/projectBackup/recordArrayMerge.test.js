import { describe, expect, it } from "vitest";
import { mergeRecordArray } from "./recordArrayMerge";

describe("project backup nested record merge", () => {
  it("matches monitoring records by id and preserves the local id", () => {
    const result = mergeRecordArray(
      [{ id: "local", date: "2026-08-01T08:00:00Z", result: "open" }],
      [{ id: "local", date: "2026-08-01T09:00:00Z", result: "resolved" }],
      "monitoringRecords",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "local", result: "resolved" });
  });

  it("uses a calendar-day fallback for date-only Excel rows", () => {
    const result = mergeRecordArray(
      [{ date: "2026-08-01T10:30:00", roundNumber: 1, result: "open" }],
      [{ date: "01.08.2026", roundNumber: 1, result: "resolved" }],
      "monitoringRecords",
      { source: "excel" },
    );

    expect(result).toHaveLength(1);
    expect(result[0].result).toBe("resolved");
  });
});
