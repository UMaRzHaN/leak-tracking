import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSafeSave } from "./useSafeSave";

describe("useSafeSave", () => {
  it("blocks a second call before React has time to render saving state", async () => {
    let release;
    const first = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const second = vi.fn();
    const { result } = renderHook(() => useSafeSave());

    let firstRun;
    await act(async () => {
      firstRun = result.current.run(first);
      await result.current.run(second);
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    await act(async () => {
      release("saved");
      await firstRun;
    });
    expect(result.current.isSaving).toBe(false);
  });
});
