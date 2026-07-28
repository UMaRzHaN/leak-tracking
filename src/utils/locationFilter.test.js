import { describe, expect, it } from "vitest";
import {
  buildLocationFilterFromEnabled,
  buildSmartLocationSelection,
  getEnabledLocations,
  matchesLeakLocationFilter,
  normalizeLocationValue,
} from "./locationFilter";

const locations = [
  "Кенкиякское",
  "Кашаганское",
  "Каламкас",
  "Королёвское",
  "Тенгизское",
  "Чинаревское",
];

describe("location filter synchronization", () => {
  it("selects the matching location and keeps all other locations unchecked", () => {
    expect(buildSmartLocationSelection(locations, "Кашаганское")).toEqual({
      Кенкиякское: false,
      Кашаганское: true,
      Каламкас: false,
      Королёвское: false,
      Тенгизское: false,
      Чинаревское: false,
    });
  });

  it("does not change location checkboxes for a tag-number search", () => {
    expect(buildSmartLocationSelection(locations, "5401")).toBeNull();
  });

  it("converts map checkboxes to a shared OR filter and back", () => {
    const enabled = Object.fromEntries(
      locations.map((location) => [
        location,
        ["Кашаганское", "Тенгизское"].includes(location),
      ]),
    );
    const filter = buildLocationFilterFromEnabled(
      locations,
      "deposit",
      enabled,
    );

    expect(filter).toEqual({
      key: "deposit",
      values: ["Кашаганское", "Тенгизское"],
    });
    expect(getEnabledLocations(locations, "deposit", filter)).toEqual(enabled);
    expect(matchesLeakLocationFilter({ deposit: "Кашаганское" }, filter)).toBe(
      true,
    );
    expect(matchesLeakLocationFilter({ deposit: "Каламкас" }, filter)).toBe(
      false,
    );
  });

  it("uses null for all locations and preserves an explicitly empty selection", () => {
    expect(
      buildLocationFilterFromEnabled(
        locations,
        "deposit",
        Object.fromEntries(locations.map((location) => [location, true])),
      ),
    ).toBeNull();
    expect(
      getEnabledLocations(locations, "deposit", {
        key: "deposit",
        values: [],
      }),
    ).toEqual(
      Object.fromEntries(locations.map((location) => [location, false])),
    );
  });
  it("keeps empty locations stable across language changes", () => {
    const filter = { key: "deposit", values: ["Не указано"] };

    expect(normalizeLocationValue("Not specified")).toBe("");
    expect(getEnabledLocations(["", "A"], "deposit", filter)).toEqual({
      "": true,
      A: false,
    });
    expect(matchesLeakLocationFilter({ deposit: null }, filter)).toBe(true);
  });
});
