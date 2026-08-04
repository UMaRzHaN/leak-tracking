import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: false }));
vi.mock("@capacitor/geolocation", () => ({ Geolocation: {} }));
vi.mock("@/utils/logger", () => ({ logger: { warn: vi.fn() } }));

const { logger } = await import("@/utils/logger");
const { useGeolocation } = await import("./useGeolocation");

const position = (lat, lng, accuracy = 5) => ({
  coords: { latitude: lat, longitude: lng, accuracy },
});

let watchPosition;
let clearWatch;
let permissionQuery;

function installGeolocation({ permissions = true } = {}) {
  watchPosition = vi.fn().mockReturnValue(42);
  clearWatch = vi.fn();
  permissionQuery = vi.fn();

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition, clearWatch },
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: permissions ? { query: permissionQuery } : undefined,
  });
}

/** Flush the promise chain `init` runs on. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  installGeolocation();
  permissionQuery.mockResolvedValue({ state: "granted", onchange: null });
});

// No afterEach teardown: Testing Library unmounts the hook after this file's
// own afterEach would have run, and the cleanup reaches for
// navigator.geolocation. beforeEach reinstalls it for every test instead.

describe("useGeolocation in the browser", () => {
  it("reports a browser with no geolocation and stops loading", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useGeolocation(true));
    await settle();

    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("publishes the coordinates the watch reports", async () => {
    const { result } = renderHook(() => useGeolocation(true));
    await settle();

    act(() => watchPosition.mock.calls[0][0](position(51.5, 71.4, 12)));

    expect(result.current.coords).toEqual({
      lat: 51.5,
      lng: 71.4,
      accuracy: 12,
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("clears the last coordinates when the watch fails", async () => {
    const { result } = renderHook(() => useGeolocation(true));
    await settle();

    act(() => watchPosition.mock.calls[0][0](position(51.5, 71.4)));
    act(() => watchPosition.mock.calls[0][1]({ message: "position denied" }));

    // A stale position is worse than none: it would put the leak in the
    // wrong place.
    expect(result.current.coords).toEqual({ lat: null, lng: null });
    expect(result.current.error).toBe("position denied");
    expect(result.current.loading).toBe(false);
  });

  it("restarts the watch when permission is granted later", async () => {
    const status = { state: "prompt", onchange: null };
    permissionQuery.mockResolvedValue(status);

    renderHook(() => useGeolocation(true));
    await settle();
    expect(watchPosition).toHaveBeenCalledTimes(1);

    status.state = "granted";
    act(() => status.onchange());

    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(watchPosition).toHaveBeenCalledTimes(2);
  });

  it("stops watching when permission is revoked", async () => {
    const status = { state: "prompt", onchange: null };
    permissionQuery.mockResolvedValue(status);

    const { result } = renderHook(() => useGeolocation(true));
    await settle();

    status.state = "denied";
    act(() => status.onchange());

    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
    expect(watchPosition).toHaveBeenCalledTimes(1);
  });

  it("keeps watching when the Permissions API is unavailable", async () => {
    permissionQuery.mockRejectedValue(new Error("not supported"));

    const { result } = renderHook(() => useGeolocation(true));
    await settle();

    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalled();

    act(() => watchPosition.mock.calls[0][0](position(1, 2)));
    expect(result.current.coords).toMatchObject({ lat: 1, lng: 2 });
  });

  it("works without a Permissions API at all", async () => {
    installGeolocation({ permissions: false });

    renderHook(() => useGeolocation(true));
    await settle();

    expect(watchPosition).toHaveBeenCalledTimes(1);
  });

  it("drops a permission listener that arrives after unmount", async () => {
    let resolveQuery;
    const status = { state: "granted", onchange: null };
    permissionQuery.mockReturnValue(
      new Promise((resolve) => {
        resolveQuery = resolve;
      }),
    );

    const { unmount } = renderHook(() => useGeolocation(true));
    await settle();
    unmount();

    await act(async () => {
      resolveQuery(status);
      await Promise.resolve();
    });

    expect(status.onchange).toBeNull();
  });

  it("clears the watch and the listener on unmount", async () => {
    const status = { state: "granted", onchange: null };
    permissionQuery.mockResolvedValue(status);

    const { unmount } = renderHook(() => useGeolocation(true));
    await settle();
    expect(status.onchange).toBeInstanceOf(Function);

    unmount();

    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(status.onchange).toBeNull();
  });

  it("never starts a watch while GPS is switched off", async () => {
    const { result } = renderHook(() => useGeolocation(false));
    await settle();

    expect(watchPosition).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.coords).toEqual({ lat: null, lng: null });
  });

  it("starts and stops as GPS is toggled", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useGeolocation(enabled),
      { initialProps: { enabled: true } },
    );
    await settle();
    act(() => watchPosition.mock.calls[0][0](position(10, 20)));
    expect(result.current.coords).toMatchObject({ lat: 10, lng: 20 });

    rerender({ enabled: false });
    await waitFor(() => expect(result.current.coords.lat).toBeNull());
    expect(clearWatch).toHaveBeenCalledWith(42);

    rerender({ enabled: true });
    await settle();
    expect(watchPosition).toHaveBeenCalledTimes(2);
  });
});
