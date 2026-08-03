import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestPermissions: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({ isNative: true }));
vi.mock("@capacitor/geolocation", () => ({
  Geolocation: mocks,
}));
vi.mock("@/utils/logger", () => ({
  logger: { warn: vi.fn() },
}));

const { useGeolocation } = await import("./useGeolocation");

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useGeolocation native lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestPermissions.mockResolvedValue({
      location: "granted",
      coarseLocation: "granted",
    });
    mocks.clearWatch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("uses approximate Android location when only coarse permission is granted", async () => {
    mocks.requestPermissions.mockResolvedValue({
      location: "denied",
      coarseLocation: "granted",
    });
    mocks.watchPosition.mockResolvedValue("coarse-watch");

    renderHook(() => useGeolocation(true));

    await waitFor(() => expect(mocks.watchPosition).toHaveBeenCalledOnce());
    expect(mocks.watchPosition.mock.calls[0][0]).toMatchObject({
      enableHighAccuracy: false,
      timeout: 60000,
      enableLocationFallback: true,
    });
  });

  it("keeps retrying native timeouts with capped exponential backoff", async () => {
    vi.useFakeTimers();
    const callbacks = [];
    mocks.watchPosition.mockImplementation(async (_options, callback) => {
      callbacks.push(callback);
      return `watch-${callbacks.length}`;
    });
    const { result } = renderHook(() => useGeolocation(true));
    await flushAsyncWork();

    expect(mocks.watchPosition).toHaveBeenCalledOnce();

    act(() => {
      callbacks[0](null, { code: "OS-PLUG-GLOC-0010" });
    });
    expect(result.current.error).toContain("повторная попытка");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(mocks.watchPosition).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.watchPosition).toHaveBeenCalledTimes(2);

    act(() => {
      callbacks[1](null, { code: "OS-PLUG-GLOC-0010" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5999);
    });
    expect(mocks.watchPosition).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.watchPosition).toHaveBeenCalledTimes(3);

    for (const expectedDelay of [12000, 24000, 30000, 30000]) {
      const callback = callbacks.at(-1);
      act(() => {
        callback(null, { code: "OS-PLUG-GLOC-0010" });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(expectedDelay - 1);
      });
      const callsBeforeRetry = mocks.watchPosition.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mocks.watchPosition).toHaveBeenCalledTimes(callsBeforeRetry + 1);
    }

    expect(result.current.error).toContain("повторная попытка");
  });

  it("keeps the last valid coordinates while recovering from a timeout", async () => {
    vi.useFakeTimers();
    const callbacks = [];
    mocks.watchPosition.mockImplementation(async (_options, callback) => {
      callbacks.push(callback);
      return `watch-${callbacks.length}`;
    });
    const { result } = renderHook(() => useGeolocation(true));
    await flushAsyncWork();

    act(() => {
      callbacks[0]({
        coords: { latitude: 41.3, longitude: 69.2, accuracy: 5 },
      });
    });
    expect(result.current.coords).toMatchObject({ lat: 41.3, lng: 69.2 });

    act(() => {
      callbacks[0](null, { code: "OS-PLUG-GLOC-0010" });
    });

    expect(result.current.coords).toMatchObject({ lat: 41.3, lng: 69.2 });
    expect(result.current.error).toContain("повторная попытка");
  });

  it("resets timeout backoff after receiving a valid position", async () => {
    vi.useFakeTimers();
    const callbacks = [];
    mocks.watchPosition.mockImplementation(async (_options, callback) => {
      callbacks.push(callback);
      return `watch-${callbacks.length}`;
    });
    renderHook(() => useGeolocation(true));
    await flushAsyncWork();

    act(() => {
      callbacks[0](null, { code: "OS-PLUG-GLOC-0010" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    act(() => {
      callbacks[1]({
        coords: { latitude: 41.3, longitude: 69.2, accuracy: 5 },
      });
      callbacks[1](null, { code: "OS-PLUG-GLOC-0010" });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(mocks.watchPosition).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.watchPosition).toHaveBeenCalledTimes(3);
  });

  it("does not retry terminal errors and clears stale coordinates", async () => {
    vi.useFakeTimers();
    let callback;
    mocks.watchPosition.mockImplementation(async (_options, nextCallback) => {
      callback = nextCallback;
      return "terminal-watch";
    });
    const { result } = renderHook(() => useGeolocation(true));
    await flushAsyncWork();

    act(() => {
      callback({
        coords: { latitude: 41.3, longitude: 69.2, accuracy: 5 },
      });
    });
    expect(result.current.coords).toMatchObject({ lat: 41.3, lng: 69.2 });

    act(() => {
      callback(null, { code: "OS-PLUG-GLOC-0007" });
    });
    expect(result.current.coords).toEqual({ lat: null, lng: null });
    expect(result.current.error).toBe("Геолокация на телефоне выключена");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(mocks.watchPosition).toHaveBeenCalledOnce();
  });

  it("cancels a scheduled timeout retry after unmount", async () => {
    vi.useFakeTimers();
    let callback;
    mocks.watchPosition.mockImplementation(async (_options, nextCallback) => {
      callback = nextCallback;
      return "retry-watch";
    });
    const { unmount } = renderHook(() => useGeolocation(true));
    await flushAsyncWork();

    act(() => {
      callback(null, { code: "OS-PLUG-GLOC-0010" });
    });
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(mocks.watchPosition).toHaveBeenCalledOnce();
  });
});
