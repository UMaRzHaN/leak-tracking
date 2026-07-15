import { describe, expect, it } from "vitest";

import { PROTECTED_FIELD_KEYS } from "./protectedFields";
import {
  SYSTEM_FIELD_KEYS,
  createFieldSets,
  isSystemFieldKey,
} from "./fieldRegistry";

describe("fieldRegistry", () => {
  it("uses system fields as protected fields", () => {
    expect([...PROTECTED_FIELD_KEYS]).toEqual(SYSTEM_FIELD_KEYS);
    expect(isSystemFieldKey("detectedBy")).toBe(true);
    expect(isSystemFieldKey("customNote")).toBe(false);
  });

  it("derives project field groups without changing field flags", () => {
    const { FIELDS, VIEW_FIELDS, EDIT_FIELDS, COPY_FIELDS, NUMBER_FIELDS } =
      createFieldSets([
        { key: "date", viewable: true, editable: false },
        {
          key: "leak_speed",
          viewable: true,
          editable: true,
          copyable: true,
          numeric: true,
        },
        { key: "internal", viewable: false, editable: false },
      ]);

    const dateField = FIELDS.find((field) => field.key === "date");
    expect(dateField).toMatchObject({ system: true });
    expect(dateField.copyable).toBeUndefined();
    expect(VIEW_FIELDS.map((field) => field.key)).toEqual([
      "date",
      "leak_speed",
    ]);
    expect(EDIT_FIELDS.map((field) => field.key)).toEqual(["leak_speed"]);
    expect(COPY_FIELDS.map((field) => field.key)).toEqual(["leak_speed"]);
    expect(NUMBER_FIELDS.map((field) => field.key)).toEqual(["leak_speed"]);
  });
});
