import { describe, expect, it } from "vitest";

import { PROTECTED_FIELD_KEYS } from "./protectedFields";
import {
  SYSTEM_FIELD_KEYS,
  createFieldSets,
  getVoiceFieldKeys,
  isSystemFieldKey,
} from "./fieldRegistry";

describe("fieldRegistry", () => {
  it("protects system and photo fields from being hidden", () => {
    expect([...PROTECTED_FIELD_KEYS]).toEqual([
      ...SYSTEM_FIELD_KEYS,
      "photo",
      "photo_repair",
      "photo_after",
    ]);
    expect(isSystemFieldKey("detectedBy")).toBe(true);
    expect(isSystemFieldKey("customNote")).toBe(false);
    expect(PROTECTED_FIELD_KEYS.has("photo")).toBe(true);
    expect(PROTECTED_FIELD_KEYS.has("customNote")).toBe(false);
  });

  it("derives project field groups without changing field flags", () => {
    const {
      FIELDS,
      VIEW_FIELDS,
      EDIT_FIELDS,
      COPY_FIELDS,
      NUMBER_FIELDS,
      VOICE_FIELDS,
    } = createFieldSets([
      { key: "date", viewable: true, editable: false },
      {
        key: "leak_speed",
        viewable: true,
        editable: true,
        copyable: true,
        voice: true,
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
    expect(VOICE_FIELDS.map((field) => field.key)).toEqual(["leak_speed"]);
    expect(getVoiceFieldKeys(FIELDS)).toEqual(["leak_speed"]);
  });
});
