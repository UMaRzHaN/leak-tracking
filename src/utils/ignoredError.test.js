import { describe, expect, it, vi } from "vitest";
import { ignoredError } from "./ignoredError";
import { logger } from "./logger";

describe("ignoredError", () => {
  it("swallows the rejection so the work around it still succeeds", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    await expect(
      Promise.reject(new Error("cleanup failed")).catch(
        ignoredError("photos.deleteOrphan"),
      ),
    ).resolves.toBeUndefined();

    warn.mockRestore();
  });

  it("leaves the failure in the diagnostics with its scope", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const error = new Error("cleanup failed");

    await Promise.reject(error).catch(ignoredError("photos.deleteOrphan"));

    expect(warn).toHaveBeenCalledWith(
      "[photos.deleteOrphan] ignored failure:",
      error,
    );
    warn.mockRestore();
  });
});
