import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeakFormProvider, useLeakFormContext } from "./LeakFormContext";

vi.mock("@/app/project/hooks/useProjectConfig", () => ({
  useProjectConfig: () => ({ system: { numeric: [] } }),
}));

describe("LeakFormContext", () => {
  it("provides the leak form state", () => {
    const { result } = renderHook(() => useLeakFormContext(), {
      wrapper: LeakFormProvider,
    });

    expect(result.current.form).toEqual({ leak_id: "", photo: null });
    expect(result.current.handle).toEqual(expect.any(Function));
  });

  it("rejects usage outside LeakFormProvider", () => {
    expect(() => renderHook(() => useLeakFormContext())).toThrow(
      "useLeakFormContext must be used inside LeakFormProvider",
    );
  });
});
