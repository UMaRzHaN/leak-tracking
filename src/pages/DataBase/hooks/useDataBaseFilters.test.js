import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDataBaseFilters } from "./useDataBaseFilters";

const DATA = [
  { id: 1, status: "open", priority: "low" },
  { id: 2, status: "in_progress", priority: "high" },
  { id: 3, status: "resolved", priority: "high" },
  { id: 4, status: "open", priority: "medium" },
];

describe("useDataBaseFilters multi-select", () => {
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
});
