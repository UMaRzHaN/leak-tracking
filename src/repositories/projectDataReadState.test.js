import { describe, expect, it } from "vitest";
import {
  getWebProjectDataReadFailurePolicy,
  isProjectDataReadWarningBlocking,
  splitProjectDataReadWarning,
} from "./projectDataReadState";

describe("projectDataReadState", () => {
  it("treats a localStorage mirror failure as non-blocking", () => {
    const warning = { source: "localstorage", blocksWrites: false };
    expect(isProjectDataReadWarningBlocking(warning)).toBe(false);
    expect(splitProjectDataReadWarning(warning)).toEqual({
      loadError: null,
      loadWarning: warning,
    });
  });

  it("keeps an IndexedDB failure blocking", () => {
    const warning = { source: "indexeddb", blocksWrites: true };
    expect(isProjectDataReadWarningBlocking(warning)).toBe(true);
    expect(splitProjectDataReadWarning(warning)).toEqual({
      loadError: warning,
      loadWarning: null,
    });
  });

  it("makes localStorage mirror failures non-blocking", () => {
    const error = new Error("localStorage unavailable");
    expect(
      getWebProjectDataReadFailurePolicy({ localStorageError: error }),
    ).toEqual({
      cause: error,
      source: "localstorage",
      blocksWrites: false,
    });
  });

  it("gives IndexedDB failure precedence and blocks writes", () => {
    const indexedDbError = new Error("IndexedDB unavailable");
    const localStorageError = new Error("localStorage unavailable");
    expect(
      getWebProjectDataReadFailurePolicy({
        indexedDbError,
        localStorageError,
      }),
    ).toEqual({
      cause: indexedDbError,
      source: "indexeddb",
      blocksWrites: true,
    });
  });

  it("keeps legacy warnings conservative", () => {
    const warning = { source: "indexeddb" };
    expect(isProjectDataReadWarningBlocking(warning)).toBe(true);
  });
});
