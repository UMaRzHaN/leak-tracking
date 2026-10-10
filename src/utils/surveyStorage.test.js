import { afterEach, describe, expect, it } from "vitest";
import { readSurvey, saveSurvey } from "./surveyStorage";

const SURVEY = {
  slice: "category",
  groups: [{ id: "g1", name: "Насосы", checked: 4, estimate: 10 }],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("saveSurvey", () => {
  afterEach(() => localStorage.clear());

  it("stamps a local edit with the current time", () => {
    saveSurvey("p1", SURVEY);

    expect(readSurvey("p1").updatedAt).not.toBe(SURVEY.updatedAt);
  });

  it("keeps the archive's timestamp on import", () => {
    // Иначе старое обследование, принятое сегодня, обгоняло бы более позднюю
    // правку с другого телефона при следующем обмене.
    saveSurvey("p1", SURVEY, { keepUpdatedAt: true });

    expect(readSurvey("p1").updatedAt).toBe(SURVEY.updatedAt);
  });

  it("keeps a group's place, which backup and merge go through", () => {
    saveSurvey("p1", {
      ...SURVEY,
      groups: [{ ...SURVEY.groups[0], place: ["ПУ-1", "Северное"] }],
    });

    expect(readSurvey("p1").groups[0].place).toEqual(["ПУ-1", "Северное"]);
  });

  it("removes the record when no groups are left", () => {
    saveSurvey("p1", SURVEY);
    saveSurvey("p1", null);

    expect(localStorage.getItem("app:p1:survey_v1")).toBeNull();
  });
});
