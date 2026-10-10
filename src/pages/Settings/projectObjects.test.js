import { describe, expect, it } from "vitest";
import {
  listProjectObjects,
  objectsUnder,
  projectObjectLevel,
} from "./projectObjects";

const LEVELS = ["field", "unit", "location"];
const records = [
  { field: "Алан", unit: "УКПГ", location: "Скв. 1" },
  { field: "Алан", unit: "УКПГ", location: "Скв. 1" },
  { field: "Алан", unit: "ДКС", location: "Скв. 2" },
  { field: "Памук", unit: "УКПГ", location: "Скв. 1" },
  { field: "Алан", unit: "УКПГ", location: "" },
];

describe("listProjectObjects", () => {
  it("keeps every level above the object and counts records", () => {
    expect(listProjectObjects(records, LEVELS)).toEqual([
      {
        key: '["Алан","УКПГ","Скв. 1"]',
        name: "Скв. 1",
        parents: ["Алан", "УКПГ"],
        path: "Алан › УКПГ",
        count: 2,
      },
      {
        key: '["Алан","ДКС","Скв. 2"]',
        name: "Скв. 2",
        parents: ["Алан", "ДКС"],
        path: "Алан › ДКС",
        count: 1,
      },
      {
        key: '["Памук","УКПГ","Скв. 1"]',
        name: "Скв. 1",
        parents: ["Памук", "УКПГ"],
        path: "Памук › УКПГ",
        count: 1,
      },
    ]);
  });

  it("has nothing to list for a project without location levels", () => {
    expect(listProjectObjects([{ location: "x" }], [])).toEqual([]);
  });
});

describe("projectObjectLevel", () => {
  const objects = listProjectObjects(records, LEVELS);

  it("starts from the first level and goes down by the trail", () => {
    expect(projectObjectLevel(objects, [])).toEqual([
      { key: "Алан", name: "Алан", objects: 2, count: 3 },
      { key: "Памук", name: "Памук", objects: 1, count: 1 },
    ]);
    expect(projectObjectLevel(objects, ["Алан"])).toEqual([
      { key: "УКПГ", name: "УКПГ", objects: 1, count: 2 },
      { key: "ДКС", name: "ДКС", objects: 1, count: 1 },
    ]);
  });

  it("ends at the objects themselves", () => {
    expect(projectObjectLevel(objects, ["Алан", "УКПГ"])).toBeNull();
    expect(
      objectsUnder(objects, ["Алан", "УКПГ"]).map((object) => object.name),
    ).toEqual(["Скв. 1"]);
  });
});
