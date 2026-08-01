import { describe, expect, it } from "vitest";
import {
  attachHistoryRecords,
  attachMonitoringRecords,
  mergeHistoryRecords,
} from "./recordMerge";

describe("Excel import record merging", () => {
  it("sorts monitoring records, adds history, and infers resolved status", () => {
    const leaks = [
      {
        leak_id: 7,
        status: "open",
        updatedAt: 1,
        monitoringRecords: [
          {
            date: "2026-01-02T10:00:00.000Z",
            roundNumber: 2,
            result: "needs_recheck",
          },
        ],
      },
    ];
    const incoming = [
      {
        date: "2026-01-02T10:00:00.000Z",
        roundNumber: 1,
        result: "needs_recheck",
        comment: "First round",
        monitoredBy: "Inspector",
      },
      {
        date: "2026-02-03T11:00:00.000Z",
        roundNumber: 3,
        result: "resolved",
        comment: "Fixed",
      },
    ];

    const [result] = attachMonitoringRecords(
      leaks,
      new Map([["7", incoming]]),
      { inferStatusForLeakIds: new Set(["7"]) },
    );

    expect(
      result.monitoringRecords.map((record) => record.roundNumber),
    ).toEqual([1, 2, 3]);
    expect(result.history).toEqual([
      expect.objectContaining({
        action: "monitoring",
        to: "in_progress",
        user: "Inspector",
        text: "First round",
      }),
      expect.objectContaining({
        action: "monitoring",
        to: "resolved",
        user: "Excel import",
        text: "Fixed",
      }),
    ]);
    expect(result.status).toBe("resolved");
    expect(result.resolvedAt).toBe("03.02.2026");
    expect(result.updatedAt).toBe(Date.parse("2026-02-03T11:00:00.000Z"));
  });

  it("clears a stale resolution when the latest result needs recheck", () => {
    const [result] = attachMonitoringRecords(
      [{ leak_id: "L-1", status: "resolved", resolvedAt: "01.01.2026" }],
      new Map([
        [
          "L-1",
          [
            {
              date: "2026-02-01T00:00:00.000Z",
              result: "needs_recheck",
            },
          ],
        ],
      ]),
      { inferStatusForLeakIds: new Set(["L-1"]) },
    );

    expect(result.status).toBe("in_progress");
    expect(result).not.toHaveProperty("resolvedAt");
  });

  it("preserves an explicit leak status when inference is not requested", () => {
    const [result] = attachMonitoringRecords(
      [{ leak_id: "L-1", status: "in_progress" }],
      new Map([
        ["L-1", [{ date: "2026-02-01T00:00:00.000Z", result: "resolved" }]],
      ]),
    );

    expect(result.status).toBe("in_progress");
    expect(result).not.toHaveProperty("resolvedAt");
  });

  it("deduplicates and sorts history while filling the fallback user", () => {
    const duplicate = {
      action: "status",
      date: "2026-02-01T00:00:00.000Z",
      to: "resolved",
      text: "Done",
    };
    const leaks = [
      {
        leak_id: "L-1",
        detectedBy: "Detector",
        updatedAt: 1,
        history: [{ ...duplicate, user: "Old user" }],
      },
    ];
    const records = [
      { ...duplicate },
      {
        action: "created",
        date: "2026-01-01T00:00:00.000Z",
        text: "Created",
        user: "Creator",
      },
    ];

    const [result] = attachHistoryRecords(leaks, new Map([["L-1", records]]));

    expect(result.history).toHaveLength(2);
    expect(result.history.map((record) => record.action)).toEqual([
      "created",
      "status",
    ]);
    expect(result.history[1].user).toBe("Detector");
    expect(result.updatedAt).toBe(Date.parse("2026-02-01T00:00:00.000Z"));
  });

  it("returns the original collection when there are no records", () => {
    const leaks = [{ leak_id: "L-1" }];

    expect(attachMonitoringRecords(leaks, new Map())).toBe(leaks);
    expect(attachHistoryRecords(leaks, new Map())).toBe(leaks);
    expect(mergeHistoryRecords([], [])).toEqual([]);
  });
});
