import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupLegacyLeaks } from "./cleanupLegacyLeaks";
import { logger } from "@/utils/logger";

vi.mock("@/utils/logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("cleanupLegacyLeaks", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("preserves legacy leak databases when inline photos are found", () => {
    localStorage.setItem(
      "leaks_database:alpha",
      JSON.stringify([{ id: 1, photo: "data:image/png;base64,abc" }]),
    );
    localStorage.setItem(
      "leaks_database:beta",
      JSON.stringify([{ id: 2, photo: null }]),
    );
    localStorage.setItem("other_key", JSON.stringify([{ id: 3 }]));

    expect(cleanupLegacyLeaks()).toBe(false);
    expect(localStorage.getItem("leaks_database:alpha")).toBe(
      JSON.stringify([{ id: 1, photo: "data:image/png;base64,abc" }]),
    );
    expect(localStorage.getItem("leaks_database:beta")).toBe(
      JSON.stringify([{ id: 2, photo: null }]),
    );
    expect(localStorage.getItem("other_key")).toBe(JSON.stringify([{ id: 3 }]));
    expect(logger.warn).toHaveBeenCalledWith(
      '[cleanupLegacyLeaks] Legacy database "leaks_database:alpha" contains inline photos and was preserved to avoid data loss.',
    );
  });

  it("logs parse failures and keeps data intact when nothing should be cleaned", () => {
    localStorage.setItem("leaks_database:broken", "{oops");
    localStorage.setItem(
      "leaks_database:clean",
      JSON.stringify([{ id: 1, photo: "file:///photo.jpg" }]),
    );

    expect(cleanupLegacyLeaks()).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      '[cleanupLegacyLeaks] Could not parse legacy key "leaks_database:broken":',
      expect.any(Error),
    );
    expect(localStorage.getItem("leaks_database:broken")).toBe("{oops");
    expect(localStorage.getItem("leaks_database:clean")).toBe(
      JSON.stringify([{ id: 1, photo: "file:///photo.jpg" }]),
    );
  });
});
