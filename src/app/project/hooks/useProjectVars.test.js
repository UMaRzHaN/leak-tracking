import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ markProjectVarsUpdated: vi.fn() }));
vi.mock("@/services/projectSyncState", () => ({
  markProjectVarsUpdated: mocks.markProjectVarsUpdated,
}));

import { useProjectVars } from "./useProjectVars";

const defaults = {
  density: 0.8,
  uncertainty: 10,
  gasType: "methane",
  pressure: 1,
};

describe("useProjectVars", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("keeps defaults in memory when there is no active project", () => {
    const { result } = renderHook(() => useProjectVars(null, defaults));

    expect(result.current.vars).toBe(defaults);
    act(() => result.current.setVars({ pressure: 5 }));
    expect(localStorage.length).toBe(0);
    expect(mocks.markProjectVarsUpdated).not.toHaveBeenCalled();
  });

  it("merges stored values and persists normalized legacy units", () => {
    localStorage.setItem(
      "app:project-1:vars_v1",
      JSON.stringify({
        density: 0.0007,
        uncertainty: 0.25,
        gasType: "unknown",
        pressure: 4,
      }),
    );

    const { result } = renderHook(() => useProjectVars("project-1", defaults));

    expect(result.current.vars).toEqual({
      density: 0.7,
      uncertainty: 25,
      gasType: "unknown",
      pressure: 4,
    });
    expect(JSON.parse(localStorage.getItem("app:project-1:vars_v1"))).toEqual({
      density: 0.7,
      uncertainty: 25,
      gasType: "unknown",
      pressure: 4,
    });
  });

  it("reads legacy settings without overwriting the current storage key", () => {
    localStorage.setItem(
      "app:project-1:settings_v1",
      JSON.stringify({ pressure: 7 }),
    );

    const { result } = renderHook(() => useProjectVars("project-1", defaults));

    expect(result.current.vars).toEqual({ ...defaults, pressure: 7 });
    expect(localStorage.getItem("app:project-1:vars_v1")).toBeNull();
  });

  it("writes, resets, and marks project variables for synchronization", () => {
    const { result } = renderHook(() => useProjectVars("project-1", defaults));

    act(() => result.current.setVars({ ...defaults, pressure: 9 }));
    expect(result.current.vars.pressure).toBe(9);
    expect(mocks.markProjectVarsUpdated).toHaveBeenLastCalledWith("project-1");

    act(() => result.current.resetVars());
    expect(result.current.vars).toBe(defaults);
    expect(localStorage.getItem("app:project-1:vars_v1")).toBeNull();
    expect(mocks.markProjectVarsUpdated).toHaveBeenCalledTimes(2);
  });

  it("refreshes only for an external update of the active project", () => {
    localStorage.setItem(
      "app:project-1:vars_v1",
      JSON.stringify({ pressure: 2 }),
    );
    const { result } = renderHook(() => useProjectVars("project-1", defaults));

    localStorage.setItem(
      "app:project-1:vars_v1",
      JSON.stringify({ pressure: 8 }),
    );
    act(() =>
      window.dispatchEvent(
        new CustomEvent("project-vars-updated", {
          detail: { projectId: "other-project" },
        }),
      ),
    );
    expect(result.current.vars.pressure).toBe(2);

    act(() =>
      window.dispatchEvent(
        new CustomEvent("project-vars-updated", {
          detail: { projectId: "project-1" },
        }),
      ),
    );
    expect(result.current.vars.pressure).toBe(8);
  });

  it("falls back to defaults when storage contains invalid JSON", () => {
    localStorage.setItem("app:project-1:vars_v1", "{broken");
    const { result } = renderHook(() => useProjectVars("project-1", defaults));

    expect(result.current.vars).toBe(defaults);
  });
});
