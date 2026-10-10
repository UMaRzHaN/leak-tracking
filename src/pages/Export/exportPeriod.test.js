import { beforeEach, describe, expect, it } from "vitest";
import {
  PERIOD,
  filterByPeriod,
  periodRange,
  pushExportHistory,
  readExportHistory,
  readExportSheets,
  saveExportSheets,
} from "./exportPeriod";

const now = new Date(2026, 9, 6, 15, 0).getTime();
const at = (id, date) => ({ id, createdAt: date });

describe("export period", () => {
  const leaks = [
    at("today", new Date(2026, 9, 6, 9).getTime()),
    at("week", new Date(2026, 9, 2, 9).getTime()),
    at("old", new Date(2026, 7, 1, 9).getTime()),
    { id: "typed", date: "05.10.2026" },
    { id: "undated" },
  ];

  it("keeps today, the week and everything", () => {
    const ids = (period) =>
      filterByPeriod(leaks, periodRange(period, {}, now)).map((l) => l.id);
    expect(ids(PERIOD.TODAY)).toEqual(["today"]);
    expect(ids(PERIOD.WEEK)).toEqual(["today", "week", "typed"]);
    expect(ids(PERIOD.ALL)).toHaveLength(5);
  });

  it("keeps an old record that was inspected within the period", () => {
    const inspected = {
      id: "inspected",
      createdAt: new Date(2026, 7, 1, 9).getTime(),
      events: [
        { type: "inspection", date: new Date(2026, 9, 4, 11).toISOString() },
      ],
    };
    const range = periodRange(PERIOD.WEEK, {}, now);
    expect(
      filterByPeriod([inspected, leaks[2]], range).map((l) => l.id),
    ).toEqual(["inspected"]);
  });

  it("takes both custom dates inclusively", () => {
    const range = periodRange(
      PERIOD.CUSTOM,
      { from: "2026-10-02", to: "2026-10-05" },
      now,
    );
    expect(filterByPeriod(leaks, range).map((l) => l.id)).toEqual([
      "week",
      "typed",
    ]);
  });
});

describe("export history", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the latest ten per project, newest first", () => {
    for (let index = 0; index < 12; index += 1) {
      pushExportHistory("p1", { name: `file-${index}` });
    }
    const history = readExportHistory("p1");
    expect(history).toHaveLength(10);
    expect(history[0].name).toBe("file-11");
    expect(readExportHistory("p2")).toEqual([]);
  });
});

describe("export sheet choice", () => {
  beforeEach(() => localStorage.clear());

  it("remembers the chosen sections and photos per project", () => {
    const initial = readExportSheets("p1");
    expect(initial.leaks).toBe(true);
    expect(initial.repairs).toBe(true);
    expect(initial.inventory).toBe(false);
    expect(initial.photos).toEqual({
      leaks: true,
      repairs: true,
      monitoring: true,
      inventory: true,
    });

    saveExportSheets("p1", {
      ...initial,
      leaks: false,
      repairs: false,
      photos: { ...initial.photos, leaks: false },
    });
    expect(readExportSheets("p1").leaks).toBe(false);
    expect(readExportSheets("p1").repairs).toBe(false);
    expect(readExportSheets("p1").photos.leaks).toBe(false);
    expect(readExportSheets("p2").repairs).toBe(true);
  });

  it("reads the old single photo switch as the same for every section", () => {
    localStorage.setItem(
      "app:p1:export_sheets_v1",
      JSON.stringify({ monitoring: true, repairs: true, photos: false }),
    );
    expect(Object.values(readExportSheets("p1").photos)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("ignores a damaged record", () => {
    localStorage.setItem("app:p1:export_sheets_v1", "{oops");
    expect(readExportSheets("p1").photos.leaks).toBe(true);
  });
});
