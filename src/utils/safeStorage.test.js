import { describe, expect, it, vi } from "vitest";
import {
  getStorageItem,
  removeStorageItem,
  setStorageItem,
} from "./safeStorage";

describe("safeStorage", () => {
  it("falls back when storage methods throw", () => {
    const get = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });
    const set = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Full", "QuotaExceededError");
      });
    const remove = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });

    expect(getStorageItem("missing", "fallback")).toBe("fallback");
    expect(setStorageItem("key", "value")).toBe(false);
    expect(removeStorageItem("key")).toBe(false);

    get.mockRestore();
    set.mockRestore();
    remove.mockRestore();
  });
});
