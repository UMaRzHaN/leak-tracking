import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({ lang: "ru", t: (key) => key }),
}));
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ project: "upstream" }),
}));

const { useMapFilters } = await import("./useMapFilters");

const center = { lat: 41, lng: 69 };
const leakAt = (lat) => ({
  id: "L1",
  leak_id: "1",
  status: "open",
  lat,
  lng: 69,
});

function distanceOf(result) {
  return result.current.visibleLeaks.find((leak) => leak.id === "L1")
    ?._distance;
}

describe("useMapFilters: расстояния в нижнем листе", () => {
  it("пересчитывает расстояние, когда точку утечки поправили", () => {
    // Ключ кэша держал только id и центр карты: утечка, перенесённая на
    // километр, показывала расстояние до старого места.
    const { result, rerender } = renderHook(
      ({ leaks }) =>
        useMapFilters({
          leaks,
          coords: null,
          gpsEnabled: false,
          sharedFilters: null,
          activeProjectId: "p1",
          open: true,
          mapCenter: center,
        }),
      { initialProps: { leaks: [leakAt(41.001)] } },
    );
    const before = distanceOf(result);
    expect(before).toBeGreaterThan(100);
    expect(before).toBeLessThan(120);

    rerender({ leaks: [leakAt(41.01)] });
    const after = distanceOf(result);
    expect(after).toBeGreaterThan(1000);
  });
});
