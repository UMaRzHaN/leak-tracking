import { describe, expect, it } from "vitest";
import { fmtDate } from "./viewBlockUtils";

describe("dates on screen", () => {
  it("shows the day, and leaves the minute to the stored record", () => {
    // The minute is kept and goes out to Excel, where a shift can be
    // reconstructed from it. On screen it was only ever noise.
    // Построено в местном времени: тест про формат, а не про часовой пояс.
    const saved = new Date(2026, 7, 19, 14, 35).toISOString();
    expect(fmtDate(saved, "ru")).toBe("19.08.2026");
  });

  it("says nothing when there is no date", () => {
    expect(fmtDate(null, "ru")).toBe("");
  });
});
