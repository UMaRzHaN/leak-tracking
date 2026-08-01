import { describe, expect, it } from "vitest";
import {
  combineDateAndTime,
  formatDate,
  formatTime,
  parseDateValue,
} from "./cellDates";

describe("Excel cell date values", () => {
  it("parses Excel serials, timestamps, and localized calendar dates", () => {
    expect(formatDate(parseDateValue(45_000))).toBe("15.03.2023");
    expect(parseDateValue(1_700_000_000_000).getTime()).toBe(1_700_000_000_000);
    expect(formatDate(parseDateValue("31.12.26"))).toBe("31.12.2026");
    expect(parseDateValue("31.02.2026")).toBeNull();
  });

  it("accepts ISO calendar values without applying timezone conversion", () => {
    const date = parseDateValue("2026-08-01T19:00:00Z", {
      calendarOnly: true,
    });
    expect(formatDate(date)).toBe("01.08.2026");
  });

  it("formats text, Date, and fractional Excel time values", () => {
    expect(formatTime("7:05:09")).toBe("07:05:09");
    expect(formatTime(0.5)).toBe("12:00:00");
    expect(formatTime(-0.25)).toBe("18:00:00");
    expect(formatTime("25:00")).toBe("");
  });

  it("combines time without mutating the supplied date", () => {
    const date = new Date(2026, 7, 1);
    const combined = combineDateAndTime(date, "14:30:15");

    expect(combined).not.toBe(date);
    expect(combined.getHours()).toBe(14);
    expect(combined.getMinutes()).toBe(30);
    expect(date.getHours()).toBe(0);
    expect(combineDateAndTime(date, "invalid")).toBe(date);
    expect(combineDateAndTime(null, "12:00")).toBeNull();
  });
});
