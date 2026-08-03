import { describe, expect, it, vi } from "vitest";

import { mapWithConcurrency } from "./runtime";

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

  it("uses a safe worker count for invalid concurrency values", async () => {
    await expect(
      mapWithConcurrency([1, 2], 0, async (value) => value),
    ).resolves.toEqual([1, 2]);
  });
});
