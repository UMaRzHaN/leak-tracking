import { describe, expect, it } from "vitest";
import {
  getMonitoringHistoryComment,
  getMonitoringResultLabel,
  getLatestMonitoringPhotoPath,
  getLeakDetailsHeroPhotoPath,
  isMonitoringDue,
} from "./monitoring";

describe("monitoring result labels", () => {
  it("uses concise Russian answers", () => {
    expect(getMonitoringResultLabel("still_leaking", "ru")).toBe("Да");
    expect(getMonitoringResultLabel("needs_recheck", "ru")).toBe("В ремонте");
    expect(getMonitoringResultLabel("resolved", "ru")).toBe("Нет");
  });

  it("keeps legacy history comments readable", () => {
    expect(
      getMonitoringHistoryComment({
        action: "monitoring",
        text: "Утечка устранена Замена уплотнения",
      }),
    ).toBe("Замена уплотнения");
  });
});
describe("monitoring photo selection", () => {
  const leak = {
    photo: "idb://original",
    monitoringRecords: [
      {
        date: "2026-07-14T12:00:00.000Z",
        photo: "idb://latest-monitoring",
      },
      {
        date: "2026-07-14T10:00:00.000Z",
        photo: "idb://older-monitoring",
      },
      {
        date: "2026-07-14T13:00:00.000Z",
        photo: null,
      },
    ],
  };

  it("selects the newest available monitoring photo for thumbnails", () => {
    expect(getLatestMonitoringPhotoPath(leak)).toBe("idb://latest-monitoring");
  });

  it("uses the newest monitoring photo in detailed and falls back to original", () => {
    expect(getLeakDetailsHeroPhotoPath(leak)).toBe("idb://latest-monitoring");
    expect(
      getLeakDetailsHeroPhotoPath({
        photo: "idb://original",
        monitoringRecords: [],
      }),
    ).toBe("idb://original");
  });
});

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
