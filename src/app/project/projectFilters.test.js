import { beforeEach, describe, expect, it } from "vitest";
import {
  clearProjectFilters,
  readProjectFilters,
  writeProjectFilters,
} from "./projectFilters";
import { STORAGE_KEYS } from "./storageKeys";

describe("project filter persistence", () => {
  beforeEach(() => localStorage.clear());

  it("restores filters separately for each project", () => {
    writeProjectFilters("one", {
      search: "tag-1",
      statusFilter: ["open"],
      priorityFilter: ["high"],
      mainLocationFilter: { key: "subdivision", values: ["North"] },
      locationFilter: { key: "deposit", values: ["A"] },
      nearbyFilter: true,
      nearbyRadius: 1000,
      monitoringFilter: "checked",
    });

    expect(readProjectFilters("one")).toMatchObject({
      search: "tag-1",
      statusFilter: ["open"],
      priorityFilter: ["high"],
      mainLocationFilter: { key: "subdivision", values: ["North"] },
      locationFilter: { key: "deposit", values: ["A"] },
      nearbyFilter: true,
      nearbyRadius: 1000,
      monitoringFilter: "checked",
    });
    expect(readProjectFilters("two").search).toBe("");
  });

  it("falls back safely when stored JSON is damaged", () => {
    localStorage.setItem(STORAGE_KEYS.PROJECT_FILTERS("one"), "{broken");

    expect(readProjectFilters("one")).toMatchObject({
      search: "",
      statusFilter: [],
      mainLocationFilter: null,
      nearbyFilter: false,
    });
  });

  it("clears stored filters", () => {
    writeProjectFilters("one", { statusFilter: ["open"] });
    clearProjectFilters("one");

    expect(
      localStorage.getItem(STORAGE_KEYS.PROJECT_FILTERS("one")),
    ).toBeNull();
  });
  it("keeps the third location level across sessions", () => {
    writeProjectFilters("one", {
      mainLocationFilter: { key: "field", values: ["West"] },
      locationFilter: { key: "station", values: ["S1"] },
      lastLocationFilter: { key: "location", values: ["Shop 1"] },
    });

    expect(readProjectFilters("one")).toMatchObject({
      lastLocationFilter: { key: "location", values: ["Shop 1"] },
    });
  });

  it("reads filters written before the third level existed", () => {
    localStorage.setItem(
      STORAGE_KEYS.PROJECT_FILTERS("one"),
      JSON.stringify({
        search: "tag-1",
        mainLocationFilter: { key: "field", values: ["West"] },
      }),
    );

    // A missing level has to mean "not filtered", or an upgrade would hide
    // every leak that the absent filter does not match.
    expect(readProjectFilters("one")).toMatchObject({
      search: "tag-1",
      mainLocationFilter: { key: "field", values: ["West"] },
      lastLocationFilter: null,
    });
  });

  it("migrates localized empty-location labels to a stable value", () => {
    writeProjectFilters("one", {
      mainLocationFilter: {
        key: "subdivision",
        values: ["Не указано", "Not specified"],
      },
    });

    expect(readProjectFilters("one").mainLocationFilter.values).toEqual([""]);
  });
});
