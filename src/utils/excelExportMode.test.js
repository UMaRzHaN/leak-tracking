import { describe, expect, it } from "vitest";
import { keepLatestPerRound } from "./excelExportMode";

const by = {
  keyOf: (item) => item.key,
  roundOf: (item) => item.round,
  timeOf: (item) => item.time,
};

describe("keepLatestPerRound", () => {
  it("keeps the latest record of each entity in each round, in order", () => {
    const items = [
      { id: 1, key: "a", round: 1, time: 1 },
      { id: 2, key: "a", round: 1, time: 3 },
      { id: 3, key: "b", round: 1, time: 2 },
      { id: 4, key: "a", round: 2, time: 4 },
      { id: 5, key: "a", round: 2, time: 5 },
    ];
    expect(keepLatestPerRound(items, by).map((item) => item.id)).toEqual([
      2, 3, 5,
    ]);
  });

  it("keeps every record without a round number", () => {
    // Записи до того, как номер обхода стали писать, — все.
    const items = [
      { id: 1, key: "a", time: 1 },
      { id: 2, key: "a", time: 2 },
      { id: 3, key: "a", round: 1, time: 3 },
    ];
    expect(keepLatestPerRound(items, by).map((item) => item.id)).toEqual([
      1, 2, 3,
    ]);
  });
});
