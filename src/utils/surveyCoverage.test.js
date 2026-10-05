import { describe, expect, it } from "vitest";
import { computeSurveyCoverage } from "./surveyCoverage";

const levelKeys = ["subdivision", "deposit", "location"];
const at = (deposit, location) => ({
  subdivision: "ЦДНГ-1",
  deposit,
  location,
});

describe("computeSurveyCoverage", () => {
  it("counts objects with leaks against every object the registry knows", () => {
    const result = computeSurveyCoverage({
      leaks: [
        at("Южное", "Скв. 1"),
        at("Южное", "Скв. 1"),
        at("Южное", "Скв. 2"),
      ],
      components: [
        at("Южное", "Скв. 1"),
        at("Южное", "Скв. 3"),
        at("Северное", "Скв. 1"),
      ],
      levelKeys,
    });

    expect(result).toEqual({ surveyed: 2, total: 4, percent: 50 });
  });

  it("tells apart objects with the same name in different places", () => {
    const result = computeSurveyCoverage({
      leaks: [at("Южное", "Скв. 1"), at("Северное", "Скв. 1")],
      levelKeys,
    });

    expect(result.surveyed).toBe(2);
  });

  it("has no total without a registry instead of claiming 100 %", () => {
    const result = computeSurveyCoverage({
      leaks: [at("Южное", "Скв. 1")],
      levelKeys,
    });

    expect(result).toEqual({ surveyed: 1, total: null, percent: null });
  });

  it("ignores records that name no object", () => {
    const result = computeSurveyCoverage({
      leaks: [at("Южное", "")],
      components: [at("Южное", "Скв. 1")],
      levelKeys,
    });

    expect(result).toEqual({ surveyed: 0, total: 1, percent: 0 });
  });
});
