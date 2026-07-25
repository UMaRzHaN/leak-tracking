import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLeakForm } from "./useLeakForm";

const { useProjectConfig } = vi.hoisted(() => ({
  useProjectConfig: vi.fn(),
}));

vi.mock("@/app/project/hooks/useProjectConfig", () => ({
  useProjectConfig,
}));

describe("useLeakForm", () => {
  beforeEach(() => {
    useProjectConfig.mockReturnValue({
      system: {
        numeric: ["pressure", { key: "temperature" }],
      },
    });
  });

  it("initializes and clears the form", () => {
    const { result } = renderHook(() => useLeakForm());

    expect(result.current.form).toEqual({ leak_id: "", photo: null });

    act(() => {
      result.current.setForm({ leak_id: "L-42", photo: "photo.jpg" });
      result.current.setErrors({ leak_id: "required" });
    });
    act(() => result.current.clearForm());

    expect(result.current.form).toEqual({ leak_id: "", photo: null });
    expect(result.current.errors).toEqual({ leak_id: "required" });
  });

  it("normalizes configured numeric fields and clears their errors", () => {
    const { result } = renderHook(() => useLeakForm());

    act(() => {
      result.current.setErrors({
        pressure: "invalid",
        temperature: "invalid",
      });
      result.current.handle("pressure", "12,5");
      result.current.handle("temperature", "-4.0");
      result.current.handle("comment", "12,5");
    });

    expect(result.current.form).toMatchObject({
      pressure: "12,5",
      temperature: "-4.0",
      comment: "12,5",
    });
    expect(result.current.errors).toMatchObject({
      pressure: "",
      temperature: "",
    });
  });

  it("works when numeric configuration is absent", () => {
    useProjectConfig.mockReturnValue(undefined);
    const { result } = renderHook(() => useLeakForm());

    act(() => result.current.handle("pressure", "12,5"));

    expect(result.current.form.pressure).toBe("12,5");
  });
});
