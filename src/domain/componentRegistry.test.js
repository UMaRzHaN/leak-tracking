import { describe, expect, it } from "vitest";
import {
  compareComponentsByUid,
  findComponentUidConflicts,
  isValidComponentUid,
  missingRequiredFields,
  nextComponentUid,
  normalizeComponent,
  parseComponentUid,
} from "@/domain/componentRegistry";

describe("component uid parsing", () => {
  it("accepts a plain run of digits", () => {
    expect(isValidComponentUid("14")).toBe(true);
    expect(isValidComponentUid(" 14 ")).toBe(true);
    expect(parseComponentUid("014")).toBe(14);
  });

  it("rejects anything that is not digits", () => {
    for (const value of ["ЗД32", "12a", "1.5", "-3", "", null, undefined]) {
      expect(isValidComponentUid(value)).toBe(false);
      expect(parseComponentUid(value)).toBeNull();
    }
  });

  it("refuses a number too large to compare safely", () => {
    expect(parseComponentUid("9".repeat(20))).toBeNull();
  });
});

describe("next uid suggestion", () => {
  it("offers one past the highest known number", () => {
    expect(
      nextComponentUid([
        { component_uid: "3" },
        { component_uid: "17" },
        { component_uid: "9" },
      ]),
    ).toBe("18");
  });

  it("starts at one on an empty registry", () => {
    expect(nextComponentUid()).toBe("1");
    expect(nextComponentUid([])).toBe("1");
  });

  it("ignores junk instead of letting it win the maximum", () => {
    expect(
      nextComponentUid([
        { component_uid: "5" },
        { component_uid: "ЗД32" },
        { component_uid: null },
      ]),
    ).toBe("6");
  });

  it("continues past merged records rather than restarting", () => {
    // After a sync the caller passes the merged set: numbering has to carry on
    // from what the other device wrote, not from this device's own maximum.
    const mine = [{ component_uid: "4" }];
    const theirs = [{ component_uid: "112" }];
    expect(nextComponentUid([...mine, ...theirs])).toBe("113");
  });
});

describe("uid conflicts", () => {
  const registry = [
    { id: "a", component_uid: "7" },
    { id: "b", component_uid: "7" },
    { id: "c", component_uid: "8" },
  ];

  it("finds the other records carrying the same number", () => {
    expect(findComponentUidConflicts(registry, "7").map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("does not report a record against itself while editing", () => {
    expect(
      findComponentUidConflicts(registry, "7", "a").map((c) => c.id),
    ).toEqual(["b"]);
  });

  it("reports nothing for a blank number", () => {
    expect(findComponentUidConflicts(registry, "")).toEqual([]);
    expect(findComponentUidConflicts(registry, null)).toEqual([]);
  });

  it("compares trimmed values so a stray space is still a duplicate", () => {
    expect(findComponentUidConflicts(registry, " 8 ")).toHaveLength(1);
  });
});

describe("sorting", () => {
  it("orders numerically, not as text", () => {
    const sorted = [
      { component_uid: "10" },
      { component_uid: "9" },
      { component_uid: "1" },
    ].sort(compareComponentsByUid);
    expect(sorted.map((c) => c.component_uid)).toEqual(["1", "9", "10"]);
  });

  it("pushes unparsable numbers to the end instead of dropping them", () => {
    const sorted = [{ component_uid: "ЗД32" }, { component_uid: "2" }].sort(
      compareComponentsByUid,
    );
    expect(sorted.map((c) => c.component_uid)).toEqual(["2", "ЗД32"]);
  });
});

describe("normalization", () => {
  it("assigns a uuid that is not the component number", () => {
    const normalized = normalizeComponent({ component_uid: "42" });
    expect(normalized.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(normalized.id).not.toBe("42");
  });

  it("keeps an existing id so editing does not fork the record", () => {
    const normalized = normalizeComponent({ id: "kept", component_uid: "1" });
    expect(normalized.id).toBe("kept");
  });

  it("leaves an unreadable plate empty rather than failing", () => {
    const normalized = normalizeComponent({
      component_uid: "5",
      component_name: "Задвижка",
    });
    expect(normalized.manufacturer).toBeUndefined();
    expect(normalized.component_name).toBe("Задвижка");
  });

  it("coerces declared numeric fields and blanks the unparsable ones", () => {
    const normalized = normalizeComponent(
      { component_uid: "5", diameter: "426", working_pressure: "" },
      { numericKeys: ["diameter", "working_pressure", "component_uid"] },
    );
    expect(normalized.diameter).toBe(426);
    expect(normalized.working_pressure).toBeNull();
    // The identity number stays a string: it is a label, not a quantity.
    expect(normalized.component_uid).toBe("5");
  });

  it("normalizes coordinates even when they are not declared numeric", () => {
    const normalized = normalizeComponent({
      component_uid: "1",
      lat: "66.146639",
      lng: "не снято",
    });
    expect(normalized.lat).toBeCloseTo(66.146639);
    expect(normalized.lng).toBeNull();
  });

  it("stamps the record with a creation date and a change time", () => {
    const normalized = normalizeComponent(
      { component_uid: "1" },
      { now: 1_700_000_000_000 },
    );
    expect(normalized.date).toBe(new Date(1_700_000_000_000).toISOString());
    expect(normalized.updatedAt).toBe(1_700_000_000_000);
  });
});

describe("required fields", () => {
  const required = ["location", "component_uid", "component_name"];

  it("names what is still missing", () => {
    expect(missingRequiredFields({ component_uid: "4" }, required)).toEqual([
      "location",
      "component_name",
    ]);
  });

  it("treats whitespace as missing", () => {
    expect(
      missingRequiredFields(
        { location: "  ", component_uid: "4", component_name: "Труба" },
        required,
      ),
    ).toEqual(["location"]);
  });

  it("returns nothing when the three anchors are filled", () => {
    expect(
      missingRequiredFields(
        {
          location: "Скважина 22",
          component_uid: "4",
          component_name: "Труба",
        },
        required,
      ),
    ).toEqual([]);
  });
});
