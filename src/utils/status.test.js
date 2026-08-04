import { describe, expect, it, vi } from "vitest";
import { translate, translateRu } from "@/test/translate";
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

  // These used to keep their own Russian and English tables and pick between
  // them by reading the stored language — the last per-language dictionary in
  // the UI layer. The labels are locale keys now, and the caller's `t` decides
  // the language.
  it("reads its labels out of the locale it is given", () => {
    expect(getStatusLabel(STATUS.OPEN, translate)).toBe("Open");
    expect(getStatusLabel(STATUS.IN_PROGRESS, translate)).toBe("Under repair");
    expect(getStatusLabel(STATUS.RESOLVED, translate)).toBe("Resolved");

    expect(getStatusLabel(STATUS.OPEN, translateRu)).toBe("Открыта");
    expect(getStatusLabel(STATUS.IN_PROGRESS, translateRu)).toBe("В ремонте");
  });

  it("labels the transition a status can make", () => {
    expect(transitionLabel(STATUS.OPEN, translate)).toBe("Start repair");
    expect(transitionLabel(STATUS.IN_PROGRESS, translate)).toBe(
      "Mark resolved",
    );
    expect(transitionLabel(STATUS.RESOLVED, translate)).toBe("Reopen");

    expect(transitionLabel(STATUS.OPEN, translateRu)).toBe("Взять в ремонт");
  });

  it("defaults an absent status to open", () => {
    expect(getStatusLabel(undefined, translate)).toBe("Open");
    expect(transitionLabel(undefined, translate)).toBe("Start repair");
  });

  // A status the locale does not name is shown as itself rather than as a raw
  // key, and gets the neutral open styling.
  it("falls back to the status name for one the locale does not know", () => {
    expect(getStatusLabel("custom", translate)).toBe("custom");
    expect(transitionLabel("custom", translate)).toBe("Change status");
    expect(getStatusMeta("unknown", translate)).toEqual({
      ...STATUS_META.open,
      label: "unknown",
      short: "unknown",
    });
  });

  it("asks for stable keys", () => {
    const t = vi.fn((key) => key);

    getStatusLabel(STATUS.RESOLVED, t);
    transitionLabel(STATUS.OPEN, t);

    expect(t).toHaveBeenCalledWith("leakDetails.statuses.resolved", {
      defaultValue: "resolved",
    });
    // The fallback is itself a key, resolved before the specific one is asked
    // for, so an unknown status still reads in the reader's language.
    expect(t).toHaveBeenCalledWith("statusActions.fallback");
    expect(t).toHaveBeenCalledWith("statusActions.open", {
      defaultValue: "statusActions.fallback",
    });
  });

  it("returns visual metadata alongside the label", () => {
    expect(getStatusMeta(STATUS.IN_PROGRESS, translate)).toEqual({
      ...STATUS_META.in_progress,
      label: "Under repair",
      short: "Under repair",
    });
  });
});
