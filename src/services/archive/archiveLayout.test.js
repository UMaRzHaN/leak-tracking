import { describe, expect, it } from "vitest";
import {
  allocateLeakFolderNames,
  monitoringPlaceField,
  planRoundMonitoringFolders,
} from "./archiveLayout";

const folderStatus = {
  open: "утечка есть",
  in_progress: "в ремонте",
  resolved: "утечки нет",
};

describe("allocateLeakFolderNames", () => {
  it("кладёт снимки утечки в LDAR под одну бирку, без состояния", () => {
    expect(
      allocateLeakFolderNames([
        { leak_id: "3242", status: "open" },
        { leak_id: "3243", status: "resolved" },
      ]),
    ).toEqual(["LDAR/3242", "LDAR/3243"]);
  });

  it("разводит совпавшие бирки", () => {
    expect(
      allocateLeakFolderNames([
        { id: "a", leak_id: "7" },
        { id: "b", leak_id: "7" },
      ]),
    ).toEqual(["LDAR/7", "LDAR/7~b"]);
  });
});

describe("planRoundMonitoringFolders", () => {
  it("кладёт осмотры в monitoring/<обход> с итогом этого обхода", () => {
    const leak = {
      leak_id: "3242",
      status: "resolved",
      events: [
        {
          type: "inspection",
          date: "2026-09-01T10:00:00.000Z",
          roundNumber: 1,
          result: "still_leaking",
        },
        {
          type: "inspection",
          date: "2026-09-20T10:00:00.000Z",
          roundNumber: 2,
          result: "still_leaking",
        },
        {
          type: "inspection",
          date: "2026-09-21T10:00:00.000Z",
          roundNumber: 2,
          result: "resolved",
        },
      ],
    };

    const { byIndex: place } = planRoundMonitoringFolders(
      [leak],
      (result) =>
        ({
          still_leaking: folderStatus.open,
          needs_recheck: folderStatus.in_progress,
          resolved: folderStatus.resolved,
        })[result],
    );

    expect(place(0, 0)).toEqual({
      roundSegment: "monitoring/1",
      leakSegment: "3242 (утечка есть)",
      recordNumber: 1,
    });
    expect(place(0, 1)).toEqual({
      roundSegment: "monitoring/2",
      leakSegment: "3242 (утечки нет)",
      recordNumber: 1,
    });
    expect(place(0, 2)).toMatchObject({
      roundSegment: "monitoring/2",
      recordNumber: 2,
    });
  });
});

describe("папка места первого уровня в обходе", () => {
  const inspected = (leak_id, subdivision) => ({
    leak_id,
    subdivision,
    events: [
      {
        type: "inspection",
        date: "2026-09-20T10:00:00.000Z",
        roundNumber: 3,
        result: "still_leaking",
      },
    ],
  });

  it("кладёт осмотры в monitoring/<обход>/<подразделение>/<бирка (итог)>", () => {
    const { byIndex: place } = planRoundMonitoringFolders(
      [inspected("4334", "УПГ/1"), inspected("4335", "")],
      () => folderStatus.open,
      { placeField: monitoringPlaceField("upstream"), noPlace: "Не указано" },
    );

    expect(place(0, 0)).toEqual({
      roundSegment: "monitoring/3/УПГ-1",
      leakSegment: "4334 (утечка есть)",
      recordNumber: 1,
    });
    // Без места — своя папка, а не корень обхода.
    expect(place(1, 0).roundSegment).toBe("monitoring/3/Не указано");
  });

  it("первый уровень берётся по типу проекта", () => {
    expect(monitoringPlaceField("upstream")).toBe("subdivision");
    expect(monitoringPlaceField("midstream")).toBe("field");
    expect(monitoringPlaceField("downstream")).toBe("locality");
    expect(monitoringPlaceField("unknown")).toBeNull();
  });
});
