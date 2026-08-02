import { describe, expect, it } from "vitest";
import { normalizeLeakTag } from "./leakIdentity";

describe("normalizeLeakTag", () => {
  it("normalizes whitespace and case without changing the source record", () => {
    const leak = { leak_id: " Tag-Ä-1 " };

    expect(normalizeLeakTag(leak.leak_id)).toBe("tag-ä-1");
    expect(leak.leak_id).toBe(" Tag-Ä-1 ");
  });

  it("returns an empty key for missing values", () => {
    expect(normalizeLeakTag(null)).toBe("");
    expect(normalizeLeakTag(undefined)).toBe("");
  });
});
