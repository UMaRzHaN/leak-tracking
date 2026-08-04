import { describe, expect, it } from "vitest";
import { translate } from "@/test/translate";
import { fieldLabel, shortFieldLabel } from "./fieldLabels";

describe("fieldLabels", () => {
  it("reads the label off the locale", () => {
    expect(fieldLabel("leak_speed", translate)).toBe("Leak rate, L/min");
  });

  it("prefers the short label where the locale defines one", () => {
    expect(shortFieldLabel("leak_speed", translate)).toBe("Leak rate");
  });

  it("falls back to the full label for a field with no short one", () => {
    expect(shortFieldLabel("district", translate)).toBe("District");
  });

  // Keys arriving from imported data have no entry, and the key itself is more
  // useful than an empty cell.
  it("falls back to the caller's label, then to the key", () => {
    expect(fieldLabel("not_a_field", translate, "From the file")).toBe(
      "From the file",
    );
    expect(fieldLabel("not_a_field", translate)).toBe("not_a_field");
    expect(shortFieldLabel("not_a_field", translate)).toBe("not_a_field");
  });
});
