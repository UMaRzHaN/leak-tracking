import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useGeolocation", () => ({
  useGeolocation: () => ({ coords: null, error: null, loading: false }),
}));

const { useAppState } = await import("./useAppState");

describe("useAppState navigation history", () => {
  beforeEach(() => {
    window.history.replaceState(null, "");
  });

  it("pushes page navigation into browser history", () => {
    const { result } = renderHook(() => useAppState());

    act(() => result.current.setPage("db"));

    expect(result.current.page).toBe("db");
    expect(result.current.prevPage).toBe("");
    expect(window.history.state.leakTrackingNavigation).toEqual({
      page: "db",
      depth: 1,
    });
  });

  it("restores the page on popstate", () => {
    const { result } = renderHook(() => useAppState());
    act(() => result.current.setPage("settings"));

    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: {
            leakTrackingNavigation: { page: "", depth: 0 },
          },
        }),
      );
    });

    expect(result.current.page).toBe("");
    expect(result.current.prevPage).toBe("settings");
  });

  it("uses browser back when the app has navigation history", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useAppState());
    act(() => result.current.setPage("add"));

    act(() => result.current.goBack());

    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
  });
});
