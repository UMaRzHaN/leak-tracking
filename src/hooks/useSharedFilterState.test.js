import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSharedFilterStates } from "./useSharedFilterState";

/** @type {Record<string, [string, any, boolean?]>} */
const SPECS = {
  statusFilter: ["setFilter", []],
  locationFilter: ["setLocationFilter", null, true],
};

describe("useSharedFilterStates", () => {
  it("keeps its own state when the screen gets no shared filters", () => {
    const { result } = renderHook(() => useSharedFilterStates(null, SPECS));
    const firstSetter = result.current.setFilter;

    act(() => result.current.setFilter(["open"]));
    act(() => result.current.setFilter((current) => [...current, "resolved"]));
    act(() => result.current.setLocationFilter({ key: "station" }));

    expect(result.current.statusFilter).toEqual(["open", "resolved"]);
    expect(result.current.locationFilter).toEqual({ key: "station" });
    // Сеттер не меняется между рендерами: на него ссылаются useCallback.
    expect(result.current.setFilter).toBe(firstSetter);
  });

  it("takes value and setter from shared filters independently", () => {
    const setFilter = vi.fn();
    const { result } = renderHook(() =>
      useSharedFilterStates({ setFilter }, SPECS),
    );

    expect(result.current.statusFilter).toEqual([]);
    expect(result.current.setFilter).toBe(setFilter);
  });

  // Фильтр по месту: при общем сеттере пустое общее значение — это «не
  // выбрано», и своё состояние его не подменяет.
  it("takes a by-setter filter wholly from shared filters", () => {
    const setLocationFilter = vi.fn();
    const { result } = renderHook(() =>
      useSharedFilterStates({ setLocationFilter }, SPECS),
    );

    expect(result.current.locationFilter).toBeNull();
    expect(result.current.setLocationFilter).toBe(setLocationFilter);
  });
});
