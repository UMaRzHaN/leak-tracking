import { describe, expect, it } from "vitest";
import { getCopyPreviousKeys } from "./copyPrevious";

describe("getCopyPreviousKeys", () => {
  it("excludes profile-managed fields but keeps regular hidden fields", () => {
    const copyable = [
      { key: "location" },
      { key: "detectedBy" },
      { key: "materials_equipment" },
      { key: "photo" },
    ];

    expect(getCopyPreviousKeys(copyable)).toEqual([
      "location",
      "materials_equipment",
    ]);
  });
});
