import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestPermissions: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({ isNative: true }));
vi.mock("@capacitor/geolocation", () => ({
  Geolocation: mocks,
}));

const { useGeolocation } = await import("./useGeolocation");

describe("useGeolocation native lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestPermissions.mockResolvedValue({ location: "granted" });
    mocks.clearWatch.mockResolvedValue(undefined);
  });

  it("clears a watch that finishes registering after unmount", async () => {
    let resolveWatch;
    mocks.watchPosition.mockReturnValue(
      new Promise((resolve) => {
        resolveWatch = resolve;
      }),
    );
    const { unmount } = renderHook(() => useGeolocation(true));

    await waitFor(() => expect(mocks.watchPosition).toHaveBeenCalledOnce());
    unmount();

    await act(async () => {
      resolveWatch("late-watch");
      await Promise.resolve();
    });

    expect(mocks.clearWatch).toHaveBeenCalledWith({ id: "late-watch" });
  });

  it("clears the last coordinates when GPS is disabled", async () => {
    let onPosition;
    mocks.watchPosition.mockImplementation(async (_options, callback) => {
      onPosition = callback;
      return "active-watch";
    });
    const { result, rerender } = renderHook(
      ({ enabled }) => useGeolocation(enabled),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(mocks.watchPosition).toHaveBeenCalledOnce());
    act(() => {
      onPosition({
        coords: { latitude: 41.3, longitude: 69.2, accuracy: 5 },
      });
    });
    expect(result.current.coords).toMatchObject({ lat: 41.3, lng: 69.2 });

    rerender({ enabled: false });

    await waitFor(() =>
      expect(result.current.coords).toEqual({ lat: null, lng: null }),
    );
    expect(mocks.clearWatch).toHaveBeenCalledWith({ id: "active-watch" });
  });
});
