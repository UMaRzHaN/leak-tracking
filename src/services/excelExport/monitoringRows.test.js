import { describe, expect, it } from "vitest";
import { EXCEL_MONITORING_EXPORT_MODE } from "@/utils/excelExportMode";
import {
  buildMonitoringRoundLookup,
  getMonitoringExportRows,
} from "./monitoringRows";

describe("Excel monitoring export rows", () => {
  it("assigns inferred round numbers by the first record date", () => {
    const leaks = [
      {
        monitoringRecords: [
          { date: "2026-08-03T00:00:00.000Z", roundId: "round-late" },
          { date: "2026-08-01T00:00:00.000Z", roundId: "round-early" },
          {
            date: "2026-07-01T00:00:00.000Z",
            roundId: "explicit",
            roundNumber: 7,
          },
        ],
      },
      {
        monitoringRecords: [
          { date: "2026-08-02T00:00:00.000Z", roundId: "round-late" },
        ],
      },
    ];

    expect([...buildMonitoringRoundLookup(leaks)]).toEqual([
      ["round-early", 1],
      ["round-late", 2],
    ]);
  });

  it("builds and sorts complete rows while preserving source photo indexes", () => {
    const leaks = [
      {
        id: 2,
        index: 20,
        leak_id: "TAG-2",
        monitoringRecords: [
          {
            id: "m2",
            date: "2026-08-02T10:00:00.000Z",
            roundNumber: 2,
            result: "resolved",
            photo: "idb://m2",
          },
        ],
      },
      {
        id: 1,
        index: 10,
        leak_id: "TAG-1",
        monitoringRecords: [
          {
            id: "m1",
            date: "2026-08-01T10:00:00.000Z",
            roundId: "round-1",
            monitoredBy: "Inspector",
          },
        ],
      },
    ];
    const lookup = new Map([["round-1", 1]]);

    const rows = getMonitoringExportRows(leaks, lookup);

    expect(rows.map((row) => row.leak_id)).toEqual(["TAG-1", "TAG-2"]);
    expect(rows[0]).toMatchObject({
      index: 10,
      roundNumber: 1,
      monitoredBy: "Inspector",
      photoMapKey: "monitoring:1:0",
      exportGroupKey: "1:round-1",
    });
    expect(rows[1]).toMatchObject({
      roundNumber: 2,
      photo: "idb://m2",
      photoMapKey: "monitoring:0:0",
    });
  });

  it("keeps only the latest record for each leak and round when requested", () => {
    const leaks = [
      {
        id: "leak-1",
        leak_id: "TAG-1",
        monitoringRecords: [
          {
            date: "2026-08-01T10:00:00.000Z",
            roundId: "round-1",
            result: "still_leaking",
          },
          {
            date: "2026-08-02T10:00:00.000Z",
            roundId: "round-1",
            result: "resolved",
          },
          {
            date: "2026-08-03T10:00:00.000Z",
            roundId: "round-2",
            result: "needs_recheck",
          },
        ],
      },
    ];
    const lookup = new Map([
      ["round-1", 1],
      ["round-2", 2],
    ]);

    const rows = getMonitoringExportRows(
      leaks,
      lookup,
      EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND,
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.result)).toEqual([
      "resolved",
      "needs_recheck",
    ]);
    expect(rows[0].photoMapKey).toBe("monitoring:0:1");
  });

  it("ignores monitoring records without dates", () => {
    const leaks = [
      {
        monitoringRecords: [{ roundId: "missing-date", result: "resolved" }],
      },
    ];

    expect(buildMonitoringRoundLookup(leaks).size).toBe(0);
    expect(getMonitoringExportRows(leaks, new Map())).toEqual([]);
  });
});
