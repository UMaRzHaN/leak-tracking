import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePhotoRequirements } from "./usePhotoRequirements";

describe("usePhotoRequirements", () => {
  beforeEach(() => localStorage.clear());

  it("requires both photos by default and stores choices per project", () => {
    const { result, rerender } = renderHook(
      ({ projectId }) => usePhotoRequirements(projectId),
      { initialProps: { projectId: "project-a" } },
    );

    expect(result.current.leakPhotoRequired).toBe(true);
    expect(result.current.monitoringPhotoRequired).toBe(true);
    act(() => result.current.setLeakPhotoRequired(false));
    act(() => result.current.setMonitoringPhotoRequired(false));
    expect(result.current.leakPhotoRequired).toBe(false);
    expect(result.current.monitoringPhotoRequired).toBe(false);

    rerender({ projectId: "project-b" });
    expect(result.current.leakPhotoRequired).toBe(true);
    expect(result.current.monitoringPhotoRequired).toBe(true);
  });

  it("migrates the previous monitoring-only setting on the next change", () => {
    localStorage.setItem(
      "app:project-a:monitoring_settings_v1",
      JSON.stringify({ photoRequired: false }),
    );
    const { result } = renderHook(() => usePhotoRequirements("project-a"));

    expect(result.current.monitoringPhotoRequired).toBe(false);
    act(() => result.current.setLeakPhotoRequired(false));
    expect(
      localStorage.getItem("app:project-a:monitoring_settings_v1"),
    ).toBeNull();
    expect(
      JSON.parse(localStorage.getItem("app:project-a:photo_requirements_v1")),
    ).toEqual({ leakPhotoRequired: false, monitoringPhotoRequired: false });
  });
});
