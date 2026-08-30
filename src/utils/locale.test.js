import { beforeEach, describe, expect, it } from "vitest";
import {
  LANGUAGE_STORAGE_KEY,
  formatCompactNumber,
  formatDate,
  formatLeakDate,
  formatNumber,
  formatRelativeTime,
  getAppLanguage,
  getIntlLocale,
  getSpeechLocale,
  readStoredLanguage,
} from "./locale";

describe("locale utilities", () => {
  beforeEach(() => localStorage.clear());

  it("normalizes supported language variants and falls back to Russian", () => {
    expect(getAppLanguage(" EN-us ")).toBe("en");
    expect(getAppLanguage("ru-RU")).toBe("ru");
    expect(getAppLanguage("uz")).toBe("ru");
    expect(getAppLanguage("")).toBe("ru");
    expect(getIntlLocale("en-GB")).toBe("en-US");
    expect(getSpeechLocale("unsupported")).toBe("ru-RU");
  });

  it("reads and normalizes the persisted application language", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "EN-US");
    expect(readStoredLanguage()).toBe("en");
    expect(getAppLanguage()).toBe("en");

    localStorage.setItem(LANGUAGE_STORAGE_KEY, "unknown");
    expect(readStoredLanguage()).toBe("ru");
  });

  it("formats regular and compact numbers through the selected locale", () => {
    expect(formatNumber(1234.5, { maximumFractionDigits: 1 }, "en")).toBe(
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(
        1234.5,
      ),
    );
    expect(formatNumber("12.75", { minimumFractionDigits: 2 }, "ru")).toBe(
      new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2 }).format(
        12.75,
      ),
    );
    expect(formatCompactNumber(1250, {}, "en")).toBe(
      new Intl.NumberFormat("en-US", { notation: "compact" }).format(1250),
    );
  });

  it("formats dates and returns an empty string for missing values", () => {
    const value = new Date(2026, 0, 2, 12, 0, 0);
    const options = { year: "numeric", month: "2-digit", day: "2-digit" };

    expect(formatDate(null, options, "en")).toBe("");
    expect(formatDate(value, options, "en")).toBe(
      new Intl.DateTimeFormat("en-US", options).format(value),
    );
  });

  it("supports Date, timestamp, ISO, and legacy day.month.year values", () => {
    const options = { year: "numeric", month: "2-digit", day: "2-digit" };
    const date = new Date(2026, 6, 15, 9, 30);
    const expected = new Intl.DateTimeFormat("en-US", options).format(date);

    expect(formatLeakDate(date, options, "en")).toBe(expected);
    expect(formatLeakDate(date.getTime(), options, "en")).toBe(expected);
    expect(formatLeakDate(date.toISOString(), options, "en")).toBe(expected);
    expect(formatLeakDate("15.07.2026 09:30", options, "en")).toBe(expected);
    expect(formatLeakDate("not-a-date", options, "en")).toBe("not-a-date");
    expect(formatLeakDate(null, options, "en")).toBe("");
  });

  it("читает свой ДД.ММ.ГГГГ днём вперёд, даже когда день похож на месяц", () => {
    // Импорт кладёт дату записи как ДД.ММ.ГГГГ, а `new Date` ждёт месяц первым
    // и от такой строки не отказывается: «10.03.2026» она читает как третье
    // октября. На карточке утечки и в подробностях день с месяцем менялись
    // местами у всех дат с числом до двенадцатого — а у «25.03.2026», где
    // `new Date` сдаётся, всё выходило верно, и проверка этого не замечала.
    const options = { year: "numeric", month: "2-digit", day: "2-digit" };
    const tenthOfMarch = new Intl.DateTimeFormat("en-US", options).format(
      new Date(2026, 2, 10),
    );

    expect(formatLeakDate("10.03.2026", options, "en")).toBe(tenthOfMarch);
    expect(formatLeakDate("01.12.2026", options, "en")).toBe(
      new Intl.DateTimeFormat("en-US", options).format(new Date(2026, 11, 1)),
    );
  });

  it("читает человеческую дату через косую черту и с коротким годом", () => {
    // Расширение: раньше показ признавал только точки и четырёхзначный год, а
    // всё прочее отдавал `new Date` — то есть читал месяцем вперёд. Теперь у
    // показа тот же разбор, что у чтения книги и сведения архивов.
    const options = { year: "numeric", month: "2-digit", day: "2-digit" };
    const tenthOfMarch = new Intl.DateTimeFormat("en-US", options).format(
      new Date(2026, 2, 10),
    );

    expect(formatLeakDate("10/03/2026", options, "en")).toBe(tenthOfMarch);
    expect(formatLeakDate("10.03.26", options, "en")).toBe(tenthOfMarch);
  });

  it("formats recent past values and rejects future, invalid, and old dates", () => {
    const now = new Date("2026-07-20T12:00:00.000Z").getTime();

    expect(formatRelativeTime(now - 30_000, { language: "en", now })).toBe(
      "just now",
    );
    expect(formatRelativeTime(now - 5 * 60_000, { language: "en", now })).toBe(
      new Intl.RelativeTimeFormat("en-US", {
        numeric: "always",
        style: "short",
      }).format(-5, "minute"),
    );
    expect(
      formatRelativeTime(now - 3 * 3_600_000, { language: "en", now }),
    ).toBe(
      new Intl.RelativeTimeFormat("en-US", {
        numeric: "always",
        style: "short",
      }).format(-3, "hour"),
    );
    expect(
      formatRelativeTime(now - 2 * 86_400_000, { language: "en", now }),
    ).toBe(
      new Intl.RelativeTimeFormat("en-US", {
        numeric: "always",
        style: "short",
      }).format(-2, "day"),
    );
    expect(formatRelativeTime(now + 1, { language: "en", now })).toBeNull();
    expect(formatRelativeTime("invalid", { language: "en", now })).toBeNull();
    expect(
      formatRelativeTime(now - 7 * 86_400_000, { language: "en", now }),
    ).toBeNull();
    expect(formatRelativeTime(null, { language: "en", now })).toBeNull();
  });
});
