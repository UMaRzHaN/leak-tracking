import { describe, expect, it } from "vitest";
import { listProjectObjects } from "./projectObjects";

describe("listProjectObjects", () => {
  it("lists every object with its path and record count", () => {
    const records = [
      { deposit: "Тенгиз", location: "Куст 12" },
      { deposit: "Тенгиз", location: "Куст 12" },
      { deposit: "Королёв", location: "Куст 12" },
      { deposit: "Тенгиз", location: "" },
    ];

    expect(listProjectObjects(records, ["deposit", "location"])).toEqual([
      {
        key: '["Тенгиз","Куст 12"]',
        name: "Куст 12",
        path: "Тенгиз",
        count: 2,
      },
      {
        key: '["Королёв","Куст 12"]',
        name: "Куст 12",
        path: "Королёв",
        count: 1,
      },
    ]);
  });

  it("has nothing to list for a project without location levels", () => {
    expect(listProjectObjects([{ location: "x" }], [])).toEqual([]);
  });
});
