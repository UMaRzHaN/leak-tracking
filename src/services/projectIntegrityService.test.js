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
});
