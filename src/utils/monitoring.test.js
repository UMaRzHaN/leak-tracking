import { describe, expect, it } from "vitest";
import { buildMonitoringPatch } from "@/pages/Monitoring/monitoringDomain";
import {
  getMonitoringAnswerLabel,
  getMonitoringRecords,
  getMonitoringHistoryComment,
  getMonitoringResultLabel,
  getLatestMonitoringPhotoPath,
  getLeakDetailsHeroPhotoPath,
  isMonitoringDue,
} from "./monitoring";

describe("monitoring result labels", () => {
  it("uses explicit states outside the answer field", () => {
    expect(getMonitoringResultLabel("still_leaking", "ru")).toBe("Утечка есть");
    expect(getMonitoringResultLabel("needs_recheck", "ru")).toBe("В ремонте");
    expect(getMonitoringResultLabel("resolved", "ru")).toBe("Утечки нет");
  });

  it("uses concise answers in the monitoring form", () => {
    expect(getMonitoringAnswerLabel("still_leaking", "ru")).toBe("Да");
    expect(getMonitoringAnswerLabel("needs_recheck", "ru")).toBe("В ремонте");
    expect(getMonitoringAnswerLabel("resolved", "ru")).toBe("Нет");
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

describe("getMonitoringRecords", () => {
  const record = (id, date) => ({ id, date, result: "still_leaking" });

  it("не показывает обход дважды, пока он пишется в оба списка", () => {
    const leak = {
      monitoringRecords: [record("r-1", "2026-08-02T10:00:00.000Z")],
      events: [
        { ...record("r-1", "2026-08-02T10:00:00.000Z"), type: "inspection" },
      ],
    };

    expect(getMonitoringRecords(leak).map((item) => item.id)).toEqual(["r-1"]);
  });

  it("подхватывает обход, приехавший только старым списком", () => {
    // Импорт книги дописывает `monitoringRecords` в уже прочитанную запись:
    // до следующего чтения проекта события у него ещё нет.
    const leak = {
      monitoringRecords: [record("r-2", "2026-08-03T10:00:00.000Z")],
      events: [
        { ...record("r-1", "2026-08-02T10:00:00.000Z"), type: "inspection" },
      ],
    };

    expect(getMonitoringRecords(leak).map((item) => item.id)).toEqual([
      "r-1",
      "r-2",
    ]);
  });

  it("отдаёт обходы по дате, а не по порядку добавления", () => {
    const leak = {
      monitoringRecords: [
        record("late", "2026-08-05T10:00:00.000Z"),
        record("early", "2026-08-01T10:00:00.000Z"),
      ],
    };

    expect(getMonitoringRecords(leak).map((item) => item.id)).toEqual([
      "early",
      "late",
    ]);
  });

  it("обход из приложения ложится в оба списка одной записью", () => {
    const patched = buildMonitoringPatch({
      leak: { id: "leak-1", status: "open" },
      draft: { result: "still_leaking" },
      monitoredBy: "Иванов",
      photoPath: null,
      roundId: "round-1",
      roundNumber: 1,
      now: new Date("2026-08-04T10:00:00.000Z"),
    });

    expect(patched.monitoringRecords).toHaveLength(1);
    expect(patched.events).toHaveLength(1);
    expect(patched.events[0].id).toBe(patched.monitoringRecords[0].id);
    expect(patched.events[0].type).toBe("inspection");
    expect(getMonitoringRecords(patched)).toHaveLength(1);
  });
});
