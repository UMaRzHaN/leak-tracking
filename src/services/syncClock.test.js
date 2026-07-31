import { beforeEach, describe, expect, it } from "vitest";
import {
  nextSyncTimestamp,
  observeSyncTimestamp,
  resetSyncClockForTests,
  sanitizeSyncTimestamp,
} from "@/services/syncClock";

describe("syncClock", () => {
  beforeEach(() => resetSyncClockForTests());

  it("preserves a valid future peer version", () => {
    const future = 10_000_000;
    expect(sanitizeSyncTimestamp(future)).toBe(future);
  });

  it("orders a local edit after an observed future peer version", () => {
    observeSyncTimestamp(20_000);
    expect(nextSyncTimestamp(0, 10_000)).toBe(20_001);
  });

  it("keeps timestamps monotonic when the device clock moves backwards", () => {
    const first = nextSyncTimestamp(0, 10_000);
    const second = nextSyncTimestamp(0, 9_000);
    expect(first).toBe(10_000);
    expect(second).toBe(10_001);
  });

  it("orders a local edit after a safe observed version", () => {
    expect(nextSyncTimestamp(20_000, 19_000)).toBe(20_001);
  });
});
