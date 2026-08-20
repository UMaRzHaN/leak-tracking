import { describe, expect, it } from "vitest";
import { appendDiagnostic, redactDiagnosticValue } from "./logger";

describe("redactDiagnosticValue", () => {
  it("redacts secrets, embedded photos, and precise coordinate pairs", () => {
    const apiKeyLikeValue = `AI${"za"}${"1".repeat(30)}`;
    const value = redactDiagnosticValue(
      `${apiKeyLikeValue} data:image/png;base64,AAAA 41.311111, 69.279777`,
    );

    expect(value).toContain("[redacted-api-key]");
    expect(value).toContain("[redacted-image]");
    expect(value).toContain("[redacted-coordinates]");
    expect(value).not.toContain("41.311111");
  });
});

describe("appendDiagnostic", () => {
  const warn = (message) => ({
    at: "2026-08-20T10:00:00.000Z",
    level: "warn",
    details: [message],
  });

  it("collapses a burst of identical failures into one counted entry", () => {
    // Массовое действие чистит фотографии по одной; сломанное хранилище
    // давало пятьсот одинаковых строк и вытесняло из буфера всё остальное.
    const entries = [];
    for (let i = 0; i < 500; i += 1)
      appendDiagnostic(entries, warn("no space"));

    expect(entries).toHaveLength(1);
    expect(entries[0].repeated).toBe(500);
  });

  it("keeps the first timestamp and records the last", () => {
    const entries = [];
    appendDiagnostic(entries, warn("no space"));
    appendDiagnostic(entries, {
      ...warn("no space"),
      at: "2026-08-20T10:05:00.000Z",
    });

    expect(entries[0].at).toBe("2026-08-20T10:00:00.000Z");
    expect(entries[0].lastAt).toBe("2026-08-20T10:05:00.000Z");
  });

  it("does not merge different failures, nor the same text at another level", () => {
    const entries = [];
    appendDiagnostic(entries, warn("no space"));
    appendDiagnostic(entries, warn("permission denied"));
    appendDiagnostic(entries, warn("no space"));
    appendDiagnostic(entries, { ...warn("no space"), level: "error" });

    expect(entries.map((entry) => entry.details[0])).toEqual([
      "no space",
      "permission denied",
      "no space",
      "no space",
    ]);
    expect(entries.at(-1).level).toBe("error");
  });
});
