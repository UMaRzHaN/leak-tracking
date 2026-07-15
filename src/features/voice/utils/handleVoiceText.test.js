import { describe, expect, it, vi } from "vitest";

import { handleVoiceText } from "./handleVoiceText";

describe("handleVoiceText", () => {
  it.each([
    [
      "upstream",
      "subdivision north deposit tengiz location pad object valve component flange",
      {
        subdivision: "North",
        deposit: "Tengiz",
        location: "Pad",
        object: "Valve",
        component: "Flange",
      },
    ],
    [
      "midstream",
      "field west station cs 12 location line 5 object valve component flange",
      {
        field: "West",
        station: "КС-12",
        location: "Line 5",
        object: "Valve",
        component: "Flange",
      },
    ],
    [
      "downstream",
      "district north locality astana address street 10 object valve component flange",
      {
        district: "North",
        locality: "Astana",
        address: "Street 10",
        object: "Valve",
        component: "Flange",
      },
    ],
  ])("maps voice location fields for %s", (project, text, expected) => {
    const setVoiceData = vi.fn();

    handleVoiceText(
      [],
      text,
      setVoiceData,
      project,
      null,
      Object.keys(expected),
    );

    expect(setVoiceData).toHaveBeenCalledWith(expected);
  });

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
