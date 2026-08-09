import { describe, expect, it } from "vitest";
import { formatNativeError } from "./nativeErrorMessage";

describe("formatNativeError", () => {
  it("appends the plugin code to the message", () => {
    expect(
      formatNativeError({
        message: "Directory already exists.",
        code: "OS-PLUG-FILE-0010",
      }),
    ).toBe("Directory already exists. (OS-PLUG-FILE-0010)");
  });

  it("does not repeat a code the message already carries", () => {
    expect(
      formatNativeError({
        message: "OS-PLUG-FILE-0010: directory already exists.",
        code: "OS-PLUG-FILE-0010",
      }),
    ).toBe("OS-PLUG-FILE-0010: directory already exists.");
  });

  it("reads plain Error objects", () => {
    expect(formatNativeError(new Error("disk is full"))).toBe("disk is full");
  });

  it("returns null when there is nothing readable to show", () => {
    // Capacitor errors are plain objects, so String(error) can yield the
    // useless "[object Object]" — a toast must fall back to its own wording.
    expect(formatNativeError(null)).toBeNull();
    expect(formatNativeError({})).toBeNull();
    expect(formatNativeError({ message: "   " })).toBeNull();
  });
});
