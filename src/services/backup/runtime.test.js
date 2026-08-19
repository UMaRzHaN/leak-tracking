import { describe, expect, it, vi } from "vitest";

import {
  mapWithConcurrency,
  waitForPhotoStorage,
  waitForProjectActivation,
  yieldToMainThread,
} from "./runtime";

describe("project backup runtime", () => {
  it("limits concurrency and preserves result order", async () => {
    let active = 0;
    let maxActive = 0;

    const result = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (value) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return value * 10;
      },
    );

    expect(maxActive).toBe(2);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("waits for in-flight workers before rejecting and stops new work", async () => {
    const completed = [];
    const mapper = vi.fn(async (value) => {
      if (value === "fail") {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("failed");
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      completed.push(value);
      return value;
    });

    await expect(
      mapWithConcurrency(["slow", "fail", "not-started"], 2, mapper),
    ).rejects.toThrow("failed");

    expect(completed).toEqual(["slow"]);
    expect(mapper).toHaveBeenCalledTimes(2);
  });

  it.each([null, undefined, false, 0, ""])(
    "rejects when a mapper throws the falsey value %p",
    async (thrownValue) => {
      let rejected = false;
      try {
        await mapWithConcurrency([1], 1, async () => {
          throw thrownValue;
        });
      } catch (error) {
        rejected = true;
        expect(error).toBe(thrownValue);
      }
      expect(rejected).toBe(true);
    },
  );

  it("uses a safe worker count for invalid concurrency values", async () => {
    await expect(
      mapWithConcurrency([1, 2], 0, async (value) => value),
    ).resolves.toEqual([1, 2]);
  });
});

describe("yieldToMainThread in a worker", () => {
  it("resolves without waiting when there is no main thread", async () => {
    const originalWindow = globalThis.window;
    const originalScope = globalThis.WorkerGlobalScope;
    // jsdom gives us a window; a worker has none and is an instance of
    // WorkerGlobalScope instead.
    delete globalThis.window;
    globalThis.WorkerGlobalScope =
      Object.getPrototypeOf(globalThis).constructor;

    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    try {
      await yieldToMainThread();
      expect(timeoutSpy).not.toHaveBeenCalled();
    } finally {
      timeoutSpy.mockRestore();
      globalThis.window = originalWindow;
      if (originalScope === undefined) delete globalThis.WorkerGlobalScope;
      else globalThis.WorkerGlobalScope = originalScope;
    }
  });
});

// Импорт не управляет ни переключением проекта, ни готовностью хранилища фото:
// обе приходят из React через ref. Отказать по таймауту важнее, чем ждать —
// иначе запись уйдёт в наполовину поднятый проект.
describe("waiting for the app to catch up", () => {
  it("returns as soon as the project becomes active", async () => {
    const ref = { current: null };
    setTimeout(() => {
      ref.current = "project-1";
    }, 20);

    await expect(
      waitForProjectActivation(ref, "project-1"),
    ).resolves.toBeUndefined();
  });

  it("returns immediately when the project is already active", async () => {
    await expect(
      waitForProjectActivation({ current: "project-1" }, "project-1"),
    ).resolves.toBeUndefined();
  });

  it("gives up when the project never becomes active", async () => {
    vi.useFakeTimers();
    try {
      const pending = waitForProjectActivation({ current: "other" }, "wanted");
      const assertion = expect(pending).rejects.toThrow(
        "Таймаут переключения проекта",
      );
      await vi.advanceTimersByTimeAsync(60 * 50);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips the wait entirely when there is no photo-storage ref", async () => {
    await expect(waitForPhotoStorage(null)).resolves.toBeUndefined();
  });

  it("returns once photo storage reports ready", async () => {
    const ref = { current: false };
    setTimeout(() => {
      ref.current = true;
    }, 20);

    await expect(waitForPhotoStorage(ref)).resolves.toBeUndefined();
  });

  it("gives up when photo storage never becomes ready", async () => {
    vi.useFakeTimers();
    try {
      const pending = waitForPhotoStorage({ current: false });
      const assertion = expect(pending).rejects.toThrow(
        "Хранилище фото не готово",
      );
      await vi.advanceTimersByTimeAsync(60 * 50);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
