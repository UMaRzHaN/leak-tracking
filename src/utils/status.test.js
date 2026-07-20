import { beforeEach, describe, expect, it, vi } from "vitest";
import { LANGUAGE_STORAGE_KEY } from "./locale";
import {
  STATUS,
  STATUS_META,
  STATUS_ORDER,
  STATUS_TRANSITIONS,
  getStatusLabel,
  getStatusMeta,
  nextStatus,
  transitionLabel,
} from "./status";

describe("status utilities", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
  });

  it("defines the strict production status workflow", () => {
    expect(STATUS_ORDER).toEqual([
      STATUS.OPEN,
      STATUS.IN_PROGRESS,
      STATUS.RESOLVED,
    ]);
    expect(STATUS_TRANSITIONS).toEqual({
      open: { next: "in_progress" },
      in_progress: { next: "resolved" },
      resolved: { next: "open" },
    });
    expect(nextStatus()).toBe(STATUS.IN_PROGRESS);
    expect(nextStatus(STATUS.OPEN)).toBe(STATUS.IN_PROGRESS);
    expect(nextStatus(STATUS.IN_PROGRESS)).toBe(STATUS.RESOLVED);
    expect(nextStatus(STATUS.RESOLVED)).toBe(STATUS.OPEN);
    expect(nextStatus("unknown")).toBe(STATUS.IN_PROGRESS);
  });

  it("returns English labels and action labels from persisted language", () => {
    expect(getStatusLabel()).toBe("Open");
    expect(getStatusLabel(STATUS.IN_PROGRESS)).toBe("Under repair");
    expect(getStatusLabel(STATUS.RESOLVED)).toBe("Resolved");
    expect(getStatusLabel("custom")).toBe("custom");

    expect(transitionLabel(STATUS.OPEN)).toBe("Start repair");
    expect(transitionLabel(STATUS.IN_PROGRESS)).toBe("Mark resolved");
    expect(transitionLabel(STATUS.RESOLVED)).toBe("Reopen");
    expect(transitionLabel("custom")).toBe("Change status");
  });

  it("passes stable translation keys and locale fallbacks to i18n", () => {
    const t = vi.fn((key, options) => `${key}:${options.defaultValue}`);

    expect(getStatusLabel(STATUS.RESOLVED, t)).toBe(
      "leakDetails.statuses.resolved:Resolved",
    );
    expect(transitionLabel(STATUS.OPEN, t)).toBe(
      "statusActions.open:Start repair",
    );
    expect(t).toHaveBeenNthCalledWith(1, "leakDetails.statuses.resolved", {
      defaultValue: "Resolved",
    });
    expect(t).toHaveBeenNthCalledWith(2, "statusActions.open", {
      defaultValue: "Start repair",
    });
  });

  it("returns visual metadata and falls back to open for unknown statuses", () => {
    expect(getStatusMeta(STATUS.IN_PROGRESS)).toEqual({
      ...STATUS_META.in_progress,
      label: "Under repair",
      short: "Under repair",
    });
    expect(getStatusMeta("unknown")).toEqual({
      ...STATUS_META.open,
      label: "unknown",
      short: "unknown",
    });
  });

  it("uses Russian defaults when the stored language is unsupported", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "unsupported");

    expect(getStatusLabel(STATUS.OPEN)).not.toBe("Open");
    expect(transitionLabel(STATUS.OPEN)).not.toBe("Start repair");
    expect(getStatusLabel(STATUS.OPEN)).toBeTruthy();
    expect(transitionLabel(STATUS.OPEN)).toBeTruthy();
  });
});
