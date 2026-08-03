import { describe, expect, it } from "vitest";
import {
  comparableExcelDate,
  isEmptyMergeValue,
  mergeFieldValuesEqual,
} from "./mergeValues";

describe("project backup merge values", () => {
  it("normalizes empty values and Excel calendar dates", () => {
    expect(isEmptyMergeValue([])).toBe(true);
    expect(comparableExcelDate("01.08.2026")).toBe("2026-8-1");
    expect(
      mergeFieldValuesEqual("date", "01.08.2026", "2026-08-01", {
        source: "excel",
      }),
    ).toBe(true);
  });
});
