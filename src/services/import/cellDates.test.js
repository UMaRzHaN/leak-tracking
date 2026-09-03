import { describe, expect, it } from "vitest";
import {
  combineDateAndTime,
  formatDate,
  formatTime,
  parseDateValue,
} from "./cellDates";

/**
 * Проверки написаны так, чтобы не зависеть от пояса машины.
 *
 * Раньше зависели: `formatDate(parseDateValue(45_000))` сходился только там,
 * где смещение неотрицательное, — серийный номер Excel считается от `Date.UTC`,
 * а читался местными геттерами, и западнее Гринвича день уезжал назад. Сверка
 * идёт по ISO, поэтому её нельзя удовлетворить, случайно совпав с поясом
 * разработчика.
 */
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

  it("держит календарный день в UTC, а не в поясе устройства", () => {
    expect(parseDateValue("09.10.2026").toISOString()).toBe(
      "2026-10-09T00:00:00.000Z",
    );
    // Ячейка-дата и ячейка-текст об одном дне обязаны дать один момент:
    // серийный номер и раньше считался от `Date.UTC`, а текст — нет.
    expect(parseDateValue(45_000).toISOString()).toBe(
      parseDateValue("15.03.2023").toISOString(),
    );
  });

  it("formats text, Date, and fractional Excel time values", () => {
    expect(formatTime("7:05:09")).toBe("07:05:09");
    expect(formatTime(0.5)).toBe("12:00:00");
    expect(formatTime(-0.25)).toBe("18:00:00");
    expect(formatTime("25:00")).toBe("");
  });

  it("combines time without mutating the supplied date", () => {
    const date = parseDateValue("01.08.2026");
    const combined = combineDateAndTime(date, "14:30:15");

    expect(combined).not.toBe(date);
    // Написанный день и написанные часы — в том виде, в каком их прочтёт
    // человек на своём устройстве, в любом поясе.
    expect([
      combined.getFullYear(),
      combined.getMonth(),
      combined.getDate(),
      combined.getHours(),
      combined.getMinutes(),
      combined.getSeconds(),
    ]).toEqual([2026, 7, 1, 14, 30, 15]);
    // Сам календарный день при этом остаётся UTC-полуночью: местным моментом
    // он становится только здесь, при сборке записи.
    expect(date.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(combineDateAndTime(null, "12:00")).toBeNull();
  });

  it("без часов ставит запись на местную полночь того же дня", () => {
    // Раньше здесь возвращался сам календарный день — полночь UTC, — и
    // дальше его читал местный `formatMomentDate`. Западнее Гринвича день
    // обхода, написанный в книге, переезжал на сутки назад.
    const day = parseDateValue("01.08.2026");
    const noTime = combineDateAndTime(day, "неразборчиво");

    expect([
      noTime.getFullYear(),
      noTime.getMonth(),
      noTime.getDate(),
      noTime.getHours(),
    ]).toEqual([2026, 7, 1, 0]);
  });
});
