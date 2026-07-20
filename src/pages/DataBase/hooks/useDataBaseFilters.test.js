import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NEARBY_RADIUS_OPTIONS,
  normalizeMultiFilter,
  useDataBaseFilters,
} from "./useDataBaseFilters";

const DATA = [
  { id: 1, status: "open", priority: "low" },
  { id: 2, status: "in_progress", priority: "high" },
  { id: 3, status: "resolved", priority: "high" },
  { id: 4, status: "open", priority: "medium" },
];

describe("useDataBaseFilters multi-select", () => {
  afterEach(() => vi.useRealTimers());

  it("normalizes legacy single and multi filter values", () => {
    expect(normalizeMultiFilter(["all", "open", "resolved"])).toEqual([
      "open",
      "resolved",
    ]);
    expect(normalizeMultiFilter("open")).toEqual(["open"]);
    expect(normalizeMultiFilter("all")).toEqual([]);
    expect(normalizeMultiFilter(null)).toEqual([]);
  });

  it("combines statuses with OR and status/priority groups with AND", () => {
    const { result } = renderHook(() =>
      useDataBaseFilters({ data: DATA, coords: null }),
    );

    act(() => result.current.setFilter(["open", "in_progress"]));
    expect(result.current.displayed.map((item) => item.id).sort()).toEqual([
      1, 2, 4,
    ]);

    act(() => result.current.setPriorityFilter(["high", "medium"]));
    expect(result.current.displayed.map((item) => item.id).sort()).toEqual([
      2, 4,
    ]);

    act(() => result.current.setFilter([]));
    expect(result.current.displayed.map((item) => item.id).sort()).toEqual([
      2, 3, 4,
    ]);
  });

  it("sorts newest first and toggles to ascending order", () => {
    const { result } = renderHook(() =>
      useDataBaseFilters({ data: DATA, coords: null }),
    );

    expect(result.current.displayed.map((item) => item.id)).toEqual([
      4, 3, 2, 1,
    ]);
    act(() => result.current.toggleSort());
    expect(result.current.displayed.map((item) => item.id)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("debounces case-insensitive search across configured fields", () => {
    vi.useFakeTimers();
    const data = [
      { id: 1, component: "Main VALVE", status: "open" },
      { id: 2, leak_description: "Flange seepage", status: "open" },
    ];
    const { result } = renderHook(() =>
      useDataBaseFilters({ data, coords: null }),
    );

    act(() => result.current.setSearch("valve"));
    expect(result.current.displayed).toHaveLength(2);
    act(() => vi.advanceTimersByTime(299));
    expect(result.current.displayed).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.displayed.map((item) => item.id)).toEqual([1]);
  });

  it("treats zero coordinates as valid GPS and applies nearby radius", () => {
    const data = [
      { id: 1, lat: 0, lng: 0, status: "open" },
      { id: 2, lat: 0.001, lng: 0, status: "open" },
      { id: 3, lat: 1, lng: 1, status: "resolved" },
    ];
    const { result } = renderHook(() =>
      useDataBaseFilters({ data, coords: { lat: 0, lng: 0 } }),
    );

    expect(result.current.hasGps).toBe(true);
    expect(result.current.nearbyRadiusOptions).toEqual(NEARBY_RADIUS_OPTIONS);
    act(() => result.current.setNearbyRadius(100));
    act(() => result.current.setNearbyFilter(true));

    expect(result.current.displayed.map((item) => item.id)).toEqual([1]);
    expect(result.current.counts.nearby).toBe(1);
    expect(result.current.counts.open).toBe(2);
    expect(result.current.counts.resolved).toBe(1);
  });

  it("uses shared filter state and delegates changes to shared setters", () => {
    const setSearch = vi.fn();
    const setFilter = vi.fn();
    const setPriorityFilter = vi.fn();
    const setNearbyFilter = vi.fn();
    const setNearbyRadius = vi.fn();
    const sharedFilters = {
      search: "",
      setSearch,
      statusFilter: "open",
      setFilter,
      priorityFilter: ["high"],
      setPriorityFilter,
      nearbyFilter: false,
      setNearbyFilter,
      nearbyRadius: 1000,
      setNearbyRadius,
    };
    const { result } = renderHook(() =>
      useDataBaseFilters({ data: DATA, coords: null, sharedFilters }),
    );

    expect(result.current.statusFilter).toEqual(["open"]);
    expect(result.current.priorityFilter).toEqual(["high"]);
    expect(result.current.displayed).toEqual([]);
    act(() => result.current.setSearch("tag"));
    act(() => result.current.setFilter(["resolved"]));
    act(() => result.current.setPriorityFilter(["low"]));
    act(() => result.current.setNearbyFilter(true));
    act(() => result.current.setNearbyRadius(500));

    expect(setSearch).toHaveBeenCalledWith("tag");
    expect(setFilter).toHaveBeenCalledWith(["resolved"]);
    expect(setPriorityFilter).toHaveBeenCalledWith(["low"]);
    expect(setNearbyFilter).toHaveBeenCalledWith(true);
    expect(setNearbyRadius).toHaveBeenCalledWith(500);
  });
});
