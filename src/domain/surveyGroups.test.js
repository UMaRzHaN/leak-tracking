import { describe, expect, it } from "vitest";
import {
  SLICE,
  normalizeSurvey,
  sliceField,
  sliceValues,
  summarizeSurvey,
  surveyCoverage,
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
