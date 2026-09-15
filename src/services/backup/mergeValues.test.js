import { describe, expect, it } from "vitest";
import {
  comparableExcelDate,
  isEmptyMergeValue,
  keepDevicePhotos,
  mergeFieldValuesEqual,
} from "./mergeValues";

describe("project backup merge values", () => {
  it("keeps a device photo against an unread archive reference only", () => {
    const current = {
      photo: "idb://device",
      previousPhoto: "zip:photos/a.jpg",
    };
    const incoming = {
      photo: "zip:photos/3778/events/event-2.jpg",
      previousPhoto: "zip:photos/b.jpg",
    };

    const kept = keepDevicePhotos(current, incoming);

    expect(kept).toEqual({
      photo: "idb://device",
      previousPhoto: "zip:photos/b.jpg",
    });
    expect(incoming.photo).toBe("zip:photos/3778/events/event-2.jpg");

    const restored = { photo: "idb://restored" };
    expect(keepDevicePhotos(current, restored)).toBe(restored);
    expect(
      keepDevicePhotos({ photo: " " }, { photo: "zip:photos/c.jpg" }),
    ).toEqual({ photo: "zip:photos/c.jpg" });
  });

  it("normalizes empty values and Excel calendar dates", () => {
    expect(isEmptyMergeValue([])).toBe(true);
    expect(comparableExcelDate("01.08.2026")).toBe("2026-8-1");
    expect(
      mergeFieldValuesEqual("date", "01.08.2026", "2026-08-01", {
        source: "excel",
      }),
    ).toBe(true);
  });
});
