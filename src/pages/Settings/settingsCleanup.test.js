import { describe, expect, it, vi } from "vitest";
import { performSettingsCleanup } from "./settingsCleanup";

describe("performSettingsCleanup", () => {
  it("waits for asynchronous database cleanup", async () => {
    let finish;
    const clearDatabase = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let settled = false;

    const cleanup = performSettingsCleanup("clearDatabase", {
      clearMapCache: vi.fn(),
      clearDatabase,
    }).then((result) => {
      settled = true;
      return result;
    });

    await Promise.resolve();
    expect(clearDatabase).toHaveBeenCalledOnce();
    expect(settled).toBe(false);

    finish();
    await expect(cleanup).resolves.toBe("clearDatabase");
  });

  it("propagates map cache cleanup failures", async () => {
    await expect(
      performSettingsCleanup("clearMapCache", {
        clearMapCache: vi.fn().mockRejectedValue(new Error("disk failed")),
        clearDatabase: vi.fn(),
      }),
    ).rejects.toThrow("disk failed");
  });
});
