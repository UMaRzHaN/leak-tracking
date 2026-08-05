import { describe, expect, it } from "vitest";
import {
  buildLocationTree,
  countLeaksAtPath,
  findChildren,
  getLocationLevelKeys,
  locationFiltersToPath,
  pathToLocationFilters,
} from "./locationTree";

const KEYS = ["field", "station", "location"];

const LEAKS = [
  { id: 1, field: "УМГ-2", station: "КС-5", location: "Цех 1" },
  { id: 2, field: "УМГ-2", station: "КС-5", location: "Цех 2" },
  { id: 3, field: "УМГ-2", station: "КС-7", location: "Цех 1" },
  { id: 4, field: "УМГ-1", station: "КС-3", location: "Цех 1" },
];

describe("getLocationLevelKeys", () => {
  it("orders the three levels and drops the ones a project does not define", () => {
    expect(
      getLocationLevelKeys({ main: "a", secondary: "b", last: "c" }),
    ).toEqual(["a", "b", "c"]);
    expect(
      getLocationLevelKeys({ main: "a", secondary: "", last: null }),
    ).toEqual(["a"]);
    expect(getLocationLevelKeys(undefined)).toEqual([]);
  });
});

describe("buildLocationTree", () => {
  it("groups leaks into a level per location field", () => {
    const tree = buildLocationTree(LEAKS, KEYS);

    expect(tree.map((node) => [node.value, node.count])).toEqual([
      ["УМГ-1", 1],
      ["УМГ-2", 3],
    ]);
    const umg2 = tree.find((node) => node.value === "УМГ-2");
    expect(umg2.children.map((node) => [node.value, node.count])).toEqual([
      ["КС-5", 2],
      ["КС-7", 1],
    ]);
    expect(
      umg2.children[0].children.map((node) => [node.value, node.count]),
    ).toEqual([
      ["Цех 1", 1],
      ["Цех 2", 1],
    ]);
  });

  it("counts every leak exactly once at each level", () => {
    const tree = buildLocationTree(LEAKS, KEYS);
    const total = tree.reduce((sum, node) => sum + node.count, 0);
    const secondLevel = tree
      .flatMap((node) => node.children)
      .reduce((sum, node) => sum + node.count, 0);

    expect(total).toBe(LEAKS.length);
    expect(secondLevel).toBe(LEAKS.length);
  });

  it("keeps leaks with no location reachable, but sorts them last", () => {
    const tree = buildLocationTree(
      [...LEAKS, { id: 5, station: "КС-9" }, { id: 6, field: "Не указано" }],
      KEYS,
    );

    expect(tree.at(-1).value).toBe("");
    expect(tree.at(-1).count).toBe(2);
    // "Не указано" is the placeholder the rest of the app writes for an empty
    // field, so it has to land in the same group as a genuinely missing value.
    expect(tree.filter((node) => node.value === "")).toHaveLength(1);
  });

  it("returns nothing for input it cannot walk", () => {
    expect(buildLocationTree(null, KEYS)).toEqual([]);
    expect(buildLocationTree(LEAKS, null)).toEqual([]);
    expect(buildLocationTree(LEAKS, [])).toEqual([]);
  });
});

describe("findChildren and countLeaksAtPath", () => {
  const tree = buildLocationTree(LEAKS, KEYS);

  it("walks down a path", () => {
    expect(findChildren(tree, []).map((node) => node.value)).toEqual([
      "УМГ-1",
      "УМГ-2",
    ]);
    expect(findChildren(tree, ["УМГ-2"]).map((node) => node.value)).toEqual([
      "КС-5",
      "КС-7",
    ]);
    expect(
      findChildren(tree, ["УМГ-2", "КС-5"]).map((node) => node.value),
    ).toEqual(["Цех 1", "Цех 2"]);
  });

  it("reports the leak count of the selected folder", () => {
    expect(countLeaksAtPath(tree, [])).toBe(4);
    expect(countLeaksAtPath(tree, ["УМГ-2"])).toBe(3);
    expect(countLeaksAtPath(tree, ["УМГ-2", "КС-5"])).toBe(2);
  });

  it("treats a path that no longer exists as empty", () => {
    expect(findChildren(tree, ["УМГ-9"])).toEqual([]);
    expect(countLeaksAtPath(tree, ["УМГ-9"])).toBe(0);
  });
});

describe("pathToLocationFilters", () => {
  it("selects one value per level and leaves deeper levels open", () => {
    expect(pathToLocationFilters(["УМГ-2"], KEYS)).toEqual([
      { key: "field", values: ["УМГ-2"] },
      null,
      null,
    ]);
    expect(pathToLocationFilters(["УМГ-2", "КС-5"], KEYS)).toEqual([
      { key: "field", values: ["УМГ-2"] },
      { key: "station", values: ["КС-5"] },
      null,
    ]);
  });

  it("clears every level at the root", () => {
    expect(pathToLocationFilters([], KEYS)).toEqual([null, null, null]);
  });
});

describe("locationFiltersToPath", () => {
  it("round-trips a path built by the browser", () => {
    for (const path of [[], ["УМГ-2"], ["УМГ-2", "КС-5", "Цех 1"]]) {
      expect(
        locationFiltersToPath(pathToLocationFilters(path, KEYS), KEYS),
      ).toEqual(path);
    }
  });

  it("refuses a multi-value filter, which no single path can describe", () => {
    const filters = [{ key: "field", values: ["УМГ-1", "УМГ-2"] }, null, null];

    expect(locationFiltersToPath(filters, KEYS)).toBeNull();
  });

  it("refuses a deeper level filtered without its parent", () => {
    const filters = [null, { key: "station", values: ["КС-5"] }, null];

    expect(locationFiltersToPath(filters, KEYS)).toBeNull();
  });

  it("refuses a filter left over from another project type", () => {
    const filters = [{ key: "deposit", values: ["Х"] }, null, null];

    expect(locationFiltersToPath(filters, KEYS)).toBeNull();
  });
});
