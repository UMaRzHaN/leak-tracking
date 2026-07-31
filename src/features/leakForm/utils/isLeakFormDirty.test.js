import { describe, expect, it } from "vitest";
import { isLeakFormDirty } from "./isLeakFormDirty";

describe("isLeakFormDirty", () => {
  it("ignores empty defaults and the profile-derived inspector name", () => {
    expect(
      isLeakFormDirty({
        leak_id: " ",
        photo: null,
        detectedBy: "Inspector",
      }),
    ).toBe(false);
  });

  it("detects meaningful scalar and nested photo values", () => {
    expect(isLeakFormDirty({ leak_speed: 0 })).toBe(true);
    expect(isLeakFormDirty({ photo: { src: "" } })).toBe(false);
    expect(isLeakFormDirty({ photo: { src: "blob:photo" } })).toBe(true);
  });
});
