import { describe, expect, it } from "vitest";
import {
  SLICE,
  leaksInPlace,
  normalizeSurvey,
  placeLabel,
  placeWithin,
  samePlace,
  sliceField,
  sliceValues,
  summarizeSurvey,
  surveyCoverage,
  surveyForPlace,
  withSurveyOptions,
} from "./surveyGroups";

const survey = normalizeSurvey({
  slice: "category",
  groups: [
    { id: "a", name: "ШГРП", checked: 48, estimate: 120 },
    { id: "b", name: "Скважины", checked: 32, estimate: "90" },
    { id: "c", name: " ", checked: 3 },
  ],
});

describe("survey groups", () => {
  it("drops nameless groups and reads numbers leniently", () => {
    expect(
      survey.groups.map((group) => [group.name, group.checked, group.estimate]),
    ).toEqual([
      ["ШГРП", 48, 120],
      ["Скважины", 32, 90],
    ]);
  });

  it("breaks coverage down by group with leaks per checked object", () => {
    const leaks = [
      { category: "шгрп" },
      { category: "ШГРП" },
      { category: "Скважины" },
      { category: "Прочее" },
    ];
    const summary = summarizeSurvey(survey, leaks, "category");

    expect(summary).toMatchObject({ checked: 80, total: 210, percent: 38 });
    expect(summary.groups[0]).toMatchObject({ leaks: 2, percent: 40 });
    expect(summary.groups[0].rate).toBeCloseTo(2 / 48);
  });

  it("never lets the estimate fall below what was checked", () => {
    const summary = summarizeSurvey(
      normalizeSurvey({ groups: [{ name: "X", checked: 10, estimate: 4 }] }),
      [],
      "category",
    );
    expect(summary.groups[0]).toMatchObject({ total: 10, percent: 100 });
  });

  it("feeds the home coverage line only once something was entered", () => {
    expect(surveyCoverage(normalizeSurvey(null))).toBeNull();
    expect(surveyCoverage(survey)).toEqual({
      surveyed: 80,
      total: 210,
      percent: 38,
      estimated: true,
    });
  });

  it("cuts by the bottom location level and suggests values from records", () => {
    expect(sliceField(SLICE.LOCATION, ["deposit", "location"])).toBe(
      "location",
    );
    expect(sliceField(SLICE.COMPONENT)).toBe("component");
    expect(
      sliceValues(
        [
          { component: "Фланец" },
          { component: "фланец" },
          { component: "Задвижка" },
        ],
        "component",
      ),
    ).toEqual(["Задвижка", "Фланец"]);
  });
});

describe("withSurveyOptions", () => {
  const steps = [
    {
      fields: [
        { type: "autocomplete", key: "category", options: ["Well"] },
        { type: "autocomplete", key: "component", options: ["Valve"] },
        { type: "input", key: "note" },
      ],
    },
  ];
  const survey = (slice, names) => ({
    slice,
    groups: names.map((name) => ({ id: name, name })),
  });

  it("adds hand-typed groups to the autocomplete of the slice field", () => {
    const [step] = withSurveyOptions(
      steps,
      survey("category", ["Compression", "well", "Compression"]),
    );
    expect(step.fields[0].options).toEqual(["Well", "Compression"]);
    expect(step.fields[1].options).toEqual(["Valve"]);
  });

  it("follows the slice to another field and leaves steps alone without groups", () => {
    const [step] = withSurveyOptions(steps, survey("component", ["Flange"]));
    expect(step.fields[1].options).toEqual(["Valve", "Flange"]);
    expect(step.fields[0].options).toEqual(["Well"]);
    expect(withSurveyOptions(steps, survey("category", []))).toBe(steps);
  });
});

describe("survey by place", () => {
  const levelKeys = ["subdivision", "deposit", "location"];
  const placed = normalizeSurvey({
    slice: "category",
    groups: [
      { id: "a", name: "ШГРП", checked: 10, estimate: 20, place: ["ПУ-1"] },
      {
        id: "b",
        name: "ШГРП",
        checked: 4,
        estimate: 40,
        place: [" ПУ-2 ", "Северное"],
      },
      { id: "c", name: "Скважины", checked: 5, estimate: 5 },
    ],
  });

  it("keeps the place as a gapless path and omits it when empty", () => {
    expect(placed.groups.map((group) => group.place)).toEqual([
      ["ПУ-1"],
      ["ПУ-2", "Северное"],
      undefined,
    ]);
    expect(
      normalizeSurvey({
        groups: [{ name: "x", place: ["ПУ-1", "", "Куст 9"] }],
      }).groups[0].place,
    ).toEqual(["ПУ-1"]);
    expect(
      normalizeSurvey({ groups: [{ name: "x", place: "ПУ-1" }] }).groups[0],
    ).not.toHaveProperty("place");
  });

  it("takes every group when no place is selected", () => {
    const { survey: shown, projectWide } = surveyForPlace(placed, []);
    expect(shown.groups).toHaveLength(3);
    expect(projectWide).toBe(false);
  });

  it("counts only the groups inside the selected place", () => {
    const north = surveyForPlace(placed, ["пу-2"]);
    expect(north.projectWide).toBe(false);
    expect(north.survey.groups.map((group) => group.id)).toEqual(["b"]);
    expect(surveyCoverage(north.survey)).toMatchObject({
      surveyed: 4,
      total: 40,
      percent: 10,
    });
    // Группа выше выбранного места к нему не относится.
    expect(
      surveyForPlace(placed, ["ПУ-1", "Южное"]).survey.groups,
    ).toHaveLength(0);
  });

  it("stays project-wide when no group has a place or several are picked", () => {
    const unplaced = normalizeSurvey({
      groups: [{ name: "ШГРП", checked: 1, estimate: 2 }],
    });
    expect(surveyForPlace(unplaced, ["ПУ-1"])).toEqual({
      survey: unplaced,
      projectWide: true,
    });
    expect(surveyForPlace(placed, null).projectWide).toBe(true);
    expect(surveyForPlace(normalizeSurvey(null), ["ПУ-1"]).projectWide).toBe(
      false,
    );
  });

  it("counts a placed group's leaks only within its place", () => {
    const leaks = [
      { subdivision: "ПУ-1", category: "ШГРП" },
      { subdivision: "ПУ-2", deposit: "Северное", category: "шгрп" },
      { subdivision: "ПУ-2", deposit: "Южное", category: "ШГРП" },
      { subdivision: "ПУ-2", deposit: "Южное", category: "Скважины" },
    ];
    const summary = summarizeSurvey(placed, leaks, "category", levelKeys);
    expect(summary.groups.map((group) => group.leaks)).toEqual([1, 1, 1]);
  });

  it("matches places case-insensitively and labels them", () => {
    expect(placeWithin(["ПУ-1", "Северное"], ["пу-1"])).toBe(true);
    expect(placeWithin(["ПУ-1"], ["ПУ-1", "Северное"])).toBe(false);
    expect(samePlace(["ПУ-1"], ["пу-1"])).toBe(true);
    expect(samePlace(undefined, [])).toBe(true);
    expect(placeLabel(["ПУ-1", "Северное"])).toBe("ПУ-1 › Северное");
    expect(
      leaksInPlace(
        [{ subdivision: "ПУ-1" }, { subdivision: "ПУ-2" }],
        ["ПУ-2"],
        levelKeys,
      ),
    ).toEqual([{ subdivision: "ПУ-2" }]);
  });
});
