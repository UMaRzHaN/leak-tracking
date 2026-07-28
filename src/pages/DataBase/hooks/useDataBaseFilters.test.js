import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROJECTS } from "@/configs/projects";

import {
  NEARBY_RADIUS_OPTIONS,
  buildLeakSearchText,
  matchesLeakSearch,
  normalizeLeakSearchText,
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

  it("searches tags, card fields, and monitoring details with multiple words", () => {
    const leak = {
      id: "leak-5401",
      leak_id: "5401",
      address: "Компрессорная станция",
      subdivision: "Нефтегазодобывающее управление",
      object: "Установка комплексной подготовки газа",
      component: "Свечная линия",
      leak_description: "Технологическое отверстие",
      detectedBy: "Иван Петров",
      equipmentType: "GFM 2.0",
      serial_number: 1042,
      monitoringRecords: [
        {
          monitoredBy: "Алексей Сидоров",
          comment: "Контроль после ремонта",
        },
      ],
    };

    expect(matchesLeakSearch(leak, "Бирка № 5401")).toBe(true);
    expect(matchesLeakSearch(leak, "Б-5401")).toBe(true);
    expect(matchesLeakSearch(leak, "свечная отверстие")).toBe(true);
    expect(matchesLeakSearch(leak, "алексей ремонт")).toBe(true);
    expect(matchesLeakSearch(leak, "1042")).toBe(true);
    expect(matchesLeakSearch(leak, "КС")).toBe(true);
    expect(matchesLeakSearch(leak, "НГДУ")).toBe(true);
    expect(matchesLeakSearch(leak, "УКПГ")).toBe(true);
    expect(matchesLeakSearch(leak, "другая бирка")).toBe(false);
    expect(buildLeakSearchText(leak)).toContain("компрессорная станция");
    expect(normalizeLeakSearchText("  Ёлка № 10  ")).toBe("елка 10");
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

  it("uses the same geographic distance for nearby counts and filtering", () => {
    const data = [{ id: 1, lat: 60, lng: 0.008, status: "open" }];
    const { result } = renderHook(() =>
      useDataBaseFilters({ data, coords: { lat: 60, lng: 0 } }),
    );

    act(() => result.current.setNearbyRadius(500));
    act(() => result.current.setNearbyFilter(true));

    expect(result.current.displayed.map((item) => item.id)).toEqual([1]);
    expect(result.current.counts.nearby).toBe(result.current.displayed.length);
  });

  it.each(Object.entries(PROJECTS))(
    "uses the configured secondary location field for %s",
    (_projectType, config) => {
      const data = [
        {
          id: 1,
          deposit: "Deposit A",
          station: "Station A",
          locality: "Locality A",
        },
        {
          id: 2,
          deposit: "Deposit B",
          station: "Station B",
          locality: "Locality B",
        },
      ];
      const configuredLocationKey = config.system.location.secondary;
      const { result } = renderHook(() =>
        useDataBaseFilters({
          data,
          coords: null,
          configuredLocationKey,
        }),
      );

      expect(result.current.locationKey).toBe(configuredLocationKey);
      expect(result.current.locationOptions).toEqual([
        data[0][configuredLocationKey],
        data[1][configuredLocationKey],
      ]);
    },
  );
  it("applies map location selections with OR in database and monitoring", () => {
    const setLocationFilter = vi.fn();
    const data = [
      { id: 1, deposit: "Кашаганское", status: "open" },
      { id: 2, deposit: "Каламкас", status: "open" },
      { id: 3, deposit: "Тенгизское", status: "resolved" },
    ];
    const sharedFilters = {
      locationFilter: {
        key: "deposit",
        values: ["Кашаганское", "Тенгизское"],
      },
      setLocationFilter,
    };
    const { result } = renderHook(() =>
      useDataBaseFilters({ data, coords: null, sharedFilters }),
    );

    expect(result.current.displayed.map((item) => item.id)).toEqual([3, 1]);
    expect(result.current.locationFilter).toEqual(sharedFilters.locationFilter);
    expect(result.current.locationKey).toBe("deposit");
    expect(new Set(result.current.locationOptions)).toEqual(
      new Set(data.map((item) => item.deposit)),
    );
    act(() => result.current.setLocationFilter(null));
    expect(setLocationFilter).toHaveBeenCalledWith(null);
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
  it.each(Object.entries(PROJECTS))(
    "uses the configured main location field for %s",
    (_projectType, config) => {
      const key = config.system.location.main;
      const data = [
        { id: 1, [key]: "Main A" },
        { id: 2, [key]: "Main B" },
      ];
      const { result } = renderHook(() =>
        useDataBaseFilters({
          data,
          coords: null,
          configuredMainLocationKey: key,
        }),
      );

      expect(result.current.mainLocationKey).toBe(key);
      expect(result.current.mainLocationOptions).toEqual(["Main A", "Main B"]);
    },
  );

  it("combines main and secondary location filters", () => {
    const data = [
      { id: 1, subdivision: "North", deposit: "A" },
      { id: 2, subdivision: "North", deposit: "B" },
      { id: 3, subdivision: "South", deposit: "A" },
    ];
    const sharedFilters = {
      mainLocationFilter: { key: "subdivision", values: ["North"] },
      setMainLocationFilter: vi.fn(),
      locationFilter: { key: "deposit", values: ["A"] },
      setLocationFilter: vi.fn(),
    };
    const { result } = renderHook(() =>
      useDataBaseFilters({ data, coords: null, sharedFilters }),
    );

    expect(result.current.displayed.map((item) => item.id)).toEqual([1]);
  });
  it("uses configured keys instead of incompatible persisted location keys", () => {
    const data = [
      { id: 1, field: "West", station: "S1", subdivision: "Old" },
      { id: 2, field: "East", station: "S2", subdivision: "North" },
    ];
    const sharedFilters = {
      mainLocationFilter: { key: "subdivision", values: ["Old"] },
      setMainLocationFilter: vi.fn(),
      locationFilter: { key: "deposit", values: ["Legacy"] },
      setLocationFilter: vi.fn(),
    };
    const { result } = renderHook(() =>
      useDataBaseFilters({
        data,
        coords: null,
        sharedFilters,
        configuredMainLocationKey: "field",
        configuredLocationKey: "station",
      }),
    );

    expect(result.current.mainLocationKey).toBe("field");
    expect(result.current.locationKey).toBe("station");
    expect(result.current.displayed.map((item) => item.id)).toEqual([2, 1]);
  });

  it("offers an empty main location as a filter option", () => {
    const { result } = renderHook(() =>
      useDataBaseFilters({
        data: [
          { id: 1, subdivision: "North" },
          { id: 2, subdivision: "" },
        ],
        coords: null,
        configuredMainLocationKey: "subdivision",
      }),
    );

    expect(result.current.mainLocationOptions).toEqual(["", "North"]);
  });
});
