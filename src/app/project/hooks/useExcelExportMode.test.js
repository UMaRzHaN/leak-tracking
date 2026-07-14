import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useExcelExportMode } from "./useExcelExportMode";

describe("useExcelExportMode", () => {
  beforeEach(() => localStorage.clear());

  it("uses full history by default and saves the project-specific choice", () => {
    const { result, rerender } = renderHook(
      ({ projectId }) => useExcelExportMode(projectId),
      { initialProps: { projectId: "project-a" } },
    );

    expect(result.current.monitoringExportMode).toBe("full");
    act(() => result.current.setMonitoringExportMode("latest_per_round"));
    expect(result.current.monitoringExportMode).toBe("latest_per_round");

    rerender({ projectId: "project-b" });
    expect(result.current.monitoringExportMode).toBe("full");
    rerender({ projectId: "project-a" });
    expect(result.current.monitoringExportMode).toBe("latest_per_round");
  });
});
