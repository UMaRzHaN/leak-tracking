import { beforeEach, describe, expect, it } from "vitest";
import {
  PERIOD,
  filterByPeriod,
  periodRange,
  pushExportHistory,
  readExportHistory,
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

  it("keeps the shift, the week and everything", () => {
    const ids = (period) =>
      filterByPeriod(leaks, periodRange(period, {}, now)).map((l) => l.id);
    expect(ids(PERIOD.SHIFT)).toEqual(["today"]);
    expect(ids(PERIOD.WEEK)).toEqual(["today", "week", "typed"]);
    expect(ids(PERIOD.ALL)).toHaveLength(5);
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
