import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRegistryFilters } from "./useRegistryFilters";

/**
 * Отбор железа общий с картой, а не свой у страницы.
 *
 * Пока он жил на странице, выбранное в реестре «Требует замены» на карте с
 * железом не значило ничего: там были все булавки.
 */
function sharedStub(initial = []) {
  const state = {
    componentStatusFilter: initial,
    nearbyFilter: false,
    nearbyRadius: 300,
  };
  return {
    ...state,
    setComponentStatusFilter: (next) => {
      state.componentStatusFilter =
        typeof next === "function" ? next(state.componentStatusFilter) : next;
    },
    setNearbyFilter: (next) => {
      state.nearbyFilter = next;
    },
    setNearbyRadius: (next) => {
      state.nearbyRadius = next;
    },
    read: () => state,
  };
}

describe("фильтры реестра", () => {
  it("берёт состояние и «рядом» из общего набора", () => {
    const shared = {
      ...sharedStub(["Требует замены"]),
      nearbyFilter: true,
      nearbyRadius: 500,
    };
    const { result } = renderHook(() => useRegistryFilters(shared));

    expect(result.current.statusFilter).toEqual(["Требует замены"]);
    expect(result.current.nearbyOnly).toBe(true);
    expect(result.current.nearbyRadius).toBe(500);
  });

  it("пишет туда же, а не в своё", () => {
    const shared = sharedStub();
    const { result } = renderHook(() => useRegistryFilters(shared));

    act(() => result.current.setStatusFilter(["В работе"]));
    act(() => result.current.setNearbyOnly(true));

    expect(shared.read().componentStatusFilter).toEqual(["В работе"]);
    expect(shared.read().nearbyFilter).toBe(true);
  });

  it("без общего набора держит своё — реестр открывают и так", () => {
    const { result } = renderHook(() => useRegistryFilters(null));

    expect(result.current.statusFilter).toEqual([]);
    act(() => result.current.setStatusFilter(["В резерве"]));

    expect(result.current.statusFilter).toEqual(["В резерве"]);
  });

  it("выключенное «рядом» из общего набора не подменяется своим", () => {
    // `?? `, а не `||`: иначе `false` из общего набора уходил бы в запасное
    // значение и отбор оживал бы сам собой.
    const shared = { ...sharedStub(), nearbyFilter: false };
    const { result } = renderHook(() => useRegistryFilters(shared));

    expect(result.current.nearbyOnly).toBe(false);
  });
});
