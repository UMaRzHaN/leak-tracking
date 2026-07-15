import { describe, expect, it, vi } from "vitest";

import { handleVoiceText } from "./handleVoiceText";

describe("handleVoiceText", () => {
  it("filters recognized fields by the configured voice output fields", () => {
    const setVoiceData = vi.fn();

    handleVoiceText(
      [],
      "leak cause corrosion leak description small leak",
      setVoiceData,
      "upstream",
      null,
      ["leak_description"],
    );

    expect(setVoiceData).toHaveBeenCalledWith({
      leak_description: "Small Leak",
    });
  });

  it("uses dictation mode when only disallowed structured fields were recognized", () => {
    const setVoiceData = vi.fn();

    handleVoiceText(
      [],
      "leak cause corrosion",
      setVoiceData,
      "upstream",
      "note",
      ["leak_description"],
    );

    expect(setVoiceData).toHaveBeenCalledWith({
      note: "leak cause corrosion",
    });
  });
});
