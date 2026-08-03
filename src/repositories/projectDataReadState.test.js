import { describe, expect, it } from "vitest";
import {
  getWebProjectDataReadFailurePolicy,
  isProjectDataReadWarningBlocking,
  splitProjectDataReadWarning,
} from "./projectDataReadState";

describe("projectDataReadState", () => {
  it("treats a mirror-store failure as non-blocking", () => {
    const warning = { source: "mirror", blocksWrites: false };
    expect(isProjectDataReadWarningBlocking(warning)).toBe(false);
    expect(splitProjectDataReadWarning(warning)).toEqual({
      loadError: null,
      loadWarning: warning,
    });
  });

  it("still treats a pre-v2 localStorage mirror warning as non-blocking", () => {
    // Warnings created by an older build carry no blocksWrites flag and name
    // localStorage as the secondary copy; they must not start blocking writes.
    expect(isProjectDataReadWarningBlocking({ source: "localstorage" })).toBe(
      false,
    );
  });

  it("keeps an IndexedDB failure blocking", () => {
    const warning = { source: "indexeddb", blocksWrites: true };
    expect(isProjectDataReadWarningBlocking(warning)).toBe(true);
    expect(splitProjectDataReadWarning(warning)).toEqual({
      loadError: warning,
      loadWarning: null,
    });
  });

  it("makes mirror-store failures non-blocking", () => {
    const error = new Error("mirror store unreadable");
    expect(getWebProjectDataReadFailurePolicy({ mirrorError: error })).toEqual({
      cause: error,
      source: "mirror",
      blocksWrites: false,
    });
  });

  it("gives primary IndexedDB failure precedence and blocks writes", () => {
    const indexedDbError = new Error("IndexedDB unavailable");
    const mirrorError = new Error("mirror store unreadable");
    expect(
      getWebProjectDataReadFailurePolicy({
        indexedDbError,
        mirrorError,
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
