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
  it.each([
    [
      "компонент кран шаровой номер пять пятьдесят на сорок",
      "Кран шаровой №5 50/40",
    ],
    [
      "компонент кш номер двадцать три пятьдесят на двадцать",
      "Кран шаровой №23 50/20",
    ],
    [
      "компонент змс номер семь восемьдесят на сорок",
      "Задвижка механическая стальная №7 80/40",
    ],
    [
      "компонент змс номер пять 20 на 40",
      "Задвижка механическая стальная №5 20/40",
    ],
    [
      "компонент кран пробковый номер пять сорок на пятьдесят",
      "Кран пробковый №5 40/50",
    ],
    [
      "компонент задвижка номер семь сорок на пятьдесят",
      "Задвижка механическая стальная №7 40/50",
    ],
  ])(
    "preserves the spoken component number and size through the full voice pipeline: %s",
    (text, component) => {
      const setVoiceData = vi.fn();

      handleVoiceText([], text, setVoiceData, "midstream", null, ["component"]);

      expect(setVoiceData).toHaveBeenCalledWith({ component });
    },
  );
});
