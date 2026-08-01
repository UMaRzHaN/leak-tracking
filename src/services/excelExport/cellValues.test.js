import { describe, expect, it } from "vitest";
import {
  applyColumnFormats,
  formatLeakTime,
  getExcelColumnFormat,
  normalizeExcelCellValue,
  parseTimestamp,
  toExcelCellValue,
  toExcelTimeValue,
} from "./cellValues";

describe("Excel export cell values", () => {
  it("parses Date, timestamp, localized, and ISO date values", () => {
    const existing = new Date("2026-08-01T10:00:00.000Z");
    expect(parseTimestamp(existing)).toBe(existing);
    expect(parseTimestamp(existing.getTime()).getTime()).toBe(
      existing.getTime(),
    );
    expect(parseTimestamp("01.08.2026 12:30:45").toISOString()).toBe(
      "2026-08-01T12:30:45.000Z",
    );
    expect(parseTimestamp("2026-08-01T10:00:00.000Z").toISOString()).toBe(
      "2026-08-01T10:00:00.000Z",
    );
    expect(parseTimestamp("invalid")).toBeNull();
    expect(parseTimestamp("")).toBeNull();
  });

  it("converts clock values to Excel day fractions", () => {
    expect(toExcelTimeValue("12:00")).toBe(0.5);
    expect(toExcelTimeValue("06:00:00")).toBe(0.25);
    expect(toExcelTimeValue("invalid")).toBe("invalid");

    const date = new Date(2026, 7, 1, 18, 0, 0);
    expect(toExcelTimeValue(date)).toBe(0.75);
  });

  it("selects number formats by domain field", () => {
    expect(getExcelColumnFormat("date")).toBe("dd.mm.yyyy");
    expect(getExcelColumnFormat("time")).toBe("hh:mm:ss");
    expect(getExcelColumnFormat("leak_id")).toBe("General");
    expect(getExcelColumnFormat("roundNumber")).toBe("#,##0");
    expect(getExcelColumnFormat("gasPercentage")).toBe("0.0%");
    expect(getExcelColumnFormat("lat")).toBe("0.000000");
    expect(getExcelColumnFormat("leak_speed")).toBe("#,##0.00");
    expect(getExcelColumnFormat("note")).toBe("@");
  });

  it("normalizes percentages, numbers, dates, and identifiers", () => {
    expect(toExcelCellValue("gasPercentage", 25)).toBe(0.25);
    expect(toExcelCellValue("uncertainty", "5")).toBe(0.05);
    expect(toExcelCellValue("flareShare", "0.4")).toBe(0.4);
    expect(toExcelCellValue("lat", "41.25")).toBe(41.25);
    expect(toExcelCellValue("leak_speed", "invalid")).toBe("invalid");
    expect(toExcelCellValue("video_id", 123)).toBe("123");
    expect(toExcelCellValue("serial_number", "0012")).toBe("0012");
    expect(toExcelCellValue("leak_id", "12345")).toBe(12345);
    expect(toExcelCellValue("leak_id", "00123")).toBe("00123");
    expect(toExcelCellValue("leak_id", "1234567890123456")).toBe(
      "1234567890123456",
    );
    expect(toExcelCellValue("date", "01.08.2026")).toBeInstanceOf(Date);
    expect(toExcelCellValue("note", null)).toBe("");
  });

  it("applies column formats to worksheet columns", () => {
    const columns = new Map();
    const sheet = {
      getColumn(index) {
        if (!columns.has(index)) columns.set(index, {});
        return columns.get(index);
      },
    };

    applyColumnFormats(sheet, ["leak_id", "date", "gasPercentage"]);

    expect(columns.get(1).numFmt).toBe("General");
    expect(columns.get(2).numFmt).toBe("dd.mm.yyyy");
    expect(columns.get(3).numFmt).toBe("0.0%");
  });

  it("formats leak time from explicit row data or the first valid timestamp", () => {
    expect(formatLeakTime({ createdAt: 0 }, { time: " 07:05 " })).toBe("07:05");

    const date = new Date(2026, 7, 1, 14, 3, 9);
    expect(formatLeakTime({ createdAt: date.getTime() }, {})).toBe("14:03:09");
    expect(formatLeakTime({}, {})).toBe("");
  });

  it("preserves valid values and clears null or invalid dates", () => {
    const validDate = new Date(2026, 7, 1);
    const invalidDate = new Date("invalid");
    expect(normalizeExcelCellValue(validDate)).toBe(validDate);
    expect(normalizeExcelCellValue(invalidDate)).toBe("");
    expect(normalizeExcelCellValue(false)).toBe(false);
    expect(normalizeExcelCellValue(null)).toBe("");
  });
});
