import { describe, expect, it } from "vitest";
import { compareLeakIds } from "./leakOrder";

describe("compareLeakIds", () => {
  it("sorts numeric and numeric-string ids numerically", () => {
    const rows = [{ id: "10" }, { id: 2 }, { id: "1" }];
    expect(rows.sort(compareLeakIds).map((row) => row.id)).toEqual([
      "1",
      2,
      "10",
    ]);
  });

  it("sorts non-numeric ids naturally instead of returning NaN", () => {
    const rows = [{ id: "leak-10" }, { id: "leak-2" }, { id: "LEAK-1" }];
    expect(rows.sort(compareLeakIds).map((row) => row.id)).toEqual([
      "LEAK-1",
      "leak-2",
      "leak-10",
    ]);
  });
});
