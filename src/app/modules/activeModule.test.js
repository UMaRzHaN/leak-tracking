import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MODULE, normalizeModule, useActiveModule } from "./activeModule";

describe("active module", () => {
  beforeEach(() => localStorage.clear());

  it("starts in LDAR and falls back to it for anything unknown", () => {
    expect(normalizeModule(undefined)).toBe(MODULE.LDAR);
    expect(normalizeModule("repairs?")).toBe(MODULE.LDAR);
    const { result } = renderHook(() => useActiveModule());
    expect(result.current[0]).toBe(MODULE.LDAR);
  });

  it("survives a restart", () => {
    const first = renderHook(() => useActiveModule());
    act(() => first.result.current[1](MODULE.MONITORING));
    first.unmount();

    const second = renderHook(() => useActiveModule());
    expect(second.result.current[0]).toBe(MODULE.MONITORING);
  });
});
