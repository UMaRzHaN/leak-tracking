import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { englishLanguageHook } from "@/test/translate";

vi.mock("@/app/hooks/useLanguage", () => englishLanguageHook());

import { useLocationScope } from "./useLocationScope";

const LEAKS = [
  { id: 1, field: "УМГ-2", station: "КС-5", location: "Цех 1" },
  { id: 2, field: "УМГ-2", station: "КС-5", location: "Цех 2" },
  { id: 3, field: "УМГ-1", station: "КС-3", location: "Цех 1" },
];

function createSharedFilters(overrides = {}) {
  return {
    mainLocationFilter: null,
    locationFilter: null,
    lastLocationFilter: null,
    setMainLocationFilter: vi.fn(),
    setLocationFilter: vi.fn(),
    setLastLocationFilter: vi.fn(),
    ...overrides,
  };
}

function renderScope(sharedFilters, projectType = "midstream") {
  return renderHook(() =>
    useLocationScope({ leaks: LEAKS, sharedFilters, projectType }),
  );
}

describe("useLocationScope", () => {
  it("names the three levels of the project type", () => {
    const { result } = renderScope(createSharedFilters());

    expect(result.current.available).toBe(true);
    expect(result.current.levelKeys).toEqual(["field", "station", "location"]);
    expect(result.current.levelLabels).toEqual(["MGPA", "Station", "Location"]);
  });

  it("reports unavailable for a project type with no location config", () => {
    const { result } = renderScope(createSharedFilters(), "unknown");

    expect(result.current.available).toBe(false);
    expect(result.current.tree).toEqual([]);
  });

  it("starts at the root when nothing is filtered", () => {
    const { result } = renderScope(createSharedFilters());

    expect(result.current.path).toEqual([]);
    expect(result.current.totalCount).toBe(3);
    expect(result.current.childrenAtPath([]).map((node) => node.value)).toEqual(
      ["УМГ-1", "УМГ-2"],
    );
  });

  it("reads the current filters back as a path with its leak count", () => {
    const { result } = renderScope(
      createSharedFilters({
        mainLocationFilter: { key: "field", values: ["УМГ-2"] },
        locationFilter: { key: "station", values: ["КС-5"] },
      }),
    );

    expect(result.current.path).toEqual(["УМГ-2", "КС-5"]);
    expect(result.current.scopedCount).toBe(2);
  });

  it("writes one filter per level when a folder is applied", () => {
    const sharedFilters = createSharedFilters();
    const { result } = renderScope(sharedFilters);

    result.current.setPath(["УМГ-2", "КС-5"]);

    expect(sharedFilters.setMainLocationFilter).toHaveBeenCalledWith({
      key: "field",
      values: ["УМГ-2"],
    });
    expect(sharedFilters.setLocationFilter).toHaveBeenCalledWith({
      key: "station",
      values: ["КС-5"],
    });
    // The level below the selection stays open, so a deeper filter left from
    // an earlier selection cannot survive into the new one.
    expect(sharedFilters.setLastLocationFilter).toHaveBeenCalledWith(null);
  });

  it("clears every level when the root is applied", () => {
    const sharedFilters = createSharedFilters({
      mainLocationFilter: { key: "field", values: ["УМГ-2"] },
    });
    const { result } = renderScope(sharedFilters);

    result.current.setPath([]);

    expect(sharedFilters.setMainLocationFilter).toHaveBeenCalledWith(null);
    expect(sharedFilters.setLocationFilter).toHaveBeenCalledWith(null);
    expect(sharedFilters.setLastLocationFilter).toHaveBeenCalledWith(null);
  });

  it("has no path when the database checkboxes selected several values", () => {
    const { result } = renderScope(
      createSharedFilters({
        mainLocationFilter: { key: "field", values: ["УМГ-1", "УМГ-2"] },
      }),
    );

    expect(result.current.path).toBeNull();
    expect(result.current.scopedCount).toBeNull();
  });

  it("survives filters left behind by a different project type", () => {
    const { result } = renderScope(
      createSharedFilters({
        mainLocationFilter: { key: "subdivision", values: ["Х"] },
      }),
    );

    expect(result.current.path).toBeNull();
  });
});
