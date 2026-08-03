import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleIdleWork } from "./scheduleIdleWork";

describe("scheduleIdleWork", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.requestIdleCallback;
    delete globalThis.cancelIdleCallback;
  });

  it("uses a delayed fallback and can cancel it", () => {
    vi.useFakeTimers();
    const work = vi.fn();

    const cancel = scheduleIdleWork(work, { fallbackDelay: 1200 });
    vi.advanceTimersByTime(1199);
    expect(work).not.toHaveBeenCalled();

    cancel();
    vi.advanceTimersByTime(1);
    expect(work).not.toHaveBeenCalled();
  });

  it("uses requestIdleCallback when the WebView provides it", () => {
    const work = vi.fn();
    const cancelIdleCallback = vi.fn();
    let idleCallback;
    globalThis.requestIdleCallback = vi.fn((callback) => {
      idleCallback = callback;
      return 17;
    });
    globalThis.cancelIdleCallback = cancelIdleCallback;

    const cancel = scheduleIdleWork(work, { timeout: 4000 });
    expect(globalThis.requestIdleCallback).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 4000 },
    );

    idleCallback();
    expect(work).toHaveBeenCalledOnce();

    cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(17);
  });
});
