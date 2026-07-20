import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/photoService", () => ({
  getPhotoSrc: vi.fn(async () => "data:image/jpeg;base64,ok"),
}));

const { analyzeProjectIntegrity } = await import("./projectIntegrityService");

describe("analyzeProjectIntegrity", () => {
  it("reports required status and monitoring photos", async () => {
    const report = await analyzeProjectIntegrity([
      {
        id: 1,
        leak_id: "1001",
        status: "in_progress",
        photo: "data:image/jpeg;base64,before",
        lat: 41,
        lng: 69,
        monitoringRecords: [{ date: "2026-07-14T00:00:00.000Z" }],
      },
      {
        id: 2,
        leak_id: "1002",
        status: "resolved",
        photo: "data:image/jpeg;base64,before",
        lat: 41,
        lng: 69,
      },
    ]);

    expect(report.ok).toBe(false);
    expect(report.missingRepairPhoto).toEqual(["1001"]);
    expect(report.missingAfterPhoto).toEqual(["1002"]);
    expect(report.missingMonitoringPhoto).toEqual([
      "1001:monitoringRecords[0]",
    ]);
  });

  it("does not report a missing monitoring photo when it is optional", async () => {
    const report = await analyzeProjectIntegrity(
      [
        {
          id: 1,
          leak_id: "1001",
          status: "open",
          photo: "data:image/jpeg;base64,before",
          lat: 41,
          lng: 69,
          monitoringRecords: [{ date: "2026-07-14T00:00:00.000Z" }],
        },
      ],
      { monitoringPhotoRequired: false },
    );

    expect(report.missingMonitoringPhoto).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("does not require status photos after an optional-photo monitoring result", async () => {
    const report = await analyzeProjectIntegrity(
      [
        {
          id: 1,
          leak_id: "1001",
          status: "resolved",
          photo: "data:image/jpeg;base64,before",
          lat: 41,
          lng: 69,
          monitoringRecords: [
            {
              date: "2026-07-14T00:00:00.000Z",
              result: "resolved",
            },
          ],
        },
        {
          id: 2,
          leak_id: "1002",
          status: "in_progress",
          photo: "data:image/jpeg;base64,before",
          lat: 41,
          lng: 69,
          monitoringRecords: [
            {
              date: "2026-07-14T01:00:00.000Z",
              result: "needs_recheck",
            },
          ],
        },
      ],
      { monitoringPhotoRequired: false },
    );

    expect(report.missingAfterPhoto).toEqual([]);
    expect(report.missingRepairPhoto).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("does not report a missing leak photo when it is optional", async () => {
    const report = await analyzeProjectIntegrity(
      [{ id: 1, leak_id: "1001", status: "open", lat: 41, lng: 69 }],
      { leakPhotoRequired: false },
    );

    expect(report.missingPhoto).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("reports null and blank coordinates as missing instead of treating them as zero", async () => {
    const report = await analyzeProjectIntegrity(
      [
        { id: "null", lat: null, lng: null },
        { id: "blank", lat: "   ", lng: "   " },
        { id: "origin", lat: 0, lng: 0 },
      ],
      { leakPhotoRequired: false, monitoringPhotoRequired: false },
    );

    expect(report.missingCoords).toEqual(["null", "blank"]);
  });
});
