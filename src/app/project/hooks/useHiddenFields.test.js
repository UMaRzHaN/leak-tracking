import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ touchProjectSettings: vi.fn() }));
vi.mock("@/app/project/projectSettings", () => ({
  PROJECT_SETTINGS_UPDATED_EVENT: "project-settings-updated",
  touchProjectSettings: mocks.touchProjectSettings,
}));

import { useHiddenFields } from "./useHiddenFields";

describe("useHiddenFields", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("stores project-scoped field visibility and removes empty settings", () => {
    const { result } = renderHook(() => useHiddenFields("project-1"));

    act(() => result.current.setHiddenFields(["pressure", "temperature"]));
    expect(result.current.hiddenFields).toEqual(
      new Set(["pressure", "temperature"]),
    );
    expect(
      JSON.parse(localStorage.getItem("app:project-1:hidden_fields_v1")),
    ).toEqual(["pressure", "temperature"]);
    expect(mocks.touchProjectSettings).toHaveBeenLastCalledWith("project-1");

    act(() => result.current.setHiddenFields(new Set()));
    expect(result.current.hiddenFields.size).toBe(0);
    expect(localStorage.getItem("app:project-1:hidden_fields_v1")).toBeNull();
    expect(mocks.touchProjectSettings).toHaveBeenCalledTimes(2);
  });

  it("keeps settings isolated when the active project changes", () => {
    localStorage.setItem(
      "app:project-1:hidden_fields_v1",
      JSON.stringify(["pressure"]),
    );
    localStorage.setItem(
      "app:project-2:hidden_fields_v1",
      JSON.stringify(["temperature"]),
    );
    const { result, rerender } = renderHook(
      ({ projectId }) => useHiddenFields(projectId),
      { initialProps: { projectId: "project-1" } },
    );

    expect(result.current.hiddenFields).toEqual(new Set(["pressure"]));
    rerender({ projectId: "project-2" });
    expect(result.current.hiddenFields).toEqual(new Set(["temperature"]));
  });

  it("refreshes only for a settings event belonging to the active project", () => {
    localStorage.setItem(
      "app:project-1:hidden_fields_v1",
      JSON.stringify(["pressure"]),
    );
    const { result } = renderHook(() => useHiddenFields("project-1"));
    localStorage.setItem(
      "app:project-1:hidden_fields_v1",
      JSON.stringify(["temperature"]),
    );

    act(() =>
      window.dispatchEvent(
        new CustomEvent("project-settings-updated", {
          detail: { projectId: "project-2" },
        }),
      ),
    );
    expect(result.current.hiddenFields).toEqual(new Set(["pressure"]));

    act(() =>
      window.dispatchEvent(
        new CustomEvent("project-settings-updated", {
          detail: { projectId: "project-1" },
        }),
      ),
    );
    expect(result.current.hiddenFields).toEqual(new Set(["temperature"]));
  });

  it("uses a safe empty set for missing projects and corrupt storage", () => {
    localStorage.setItem("app:project-1:hidden_fields_v1", "{broken");
    const invalid = renderHook(() => useHiddenFields("project-1"));
    const missing = renderHook(() => useHiddenFields(null));

    expect(invalid.result.current.hiddenFields).toEqual(new Set());
    expect(missing.result.current.hiddenFields).toEqual(new Set());
    act(() => missing.result.current.setHiddenFields(["pressure"]));
    expect(localStorage.length).toBe(1);
    expect(mocks.touchProjectSettings).not.toHaveBeenCalled();
  });
});
