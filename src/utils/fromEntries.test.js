import { describe, expect, it } from "vitest";
import { fromEntries } from "./fromEntries";

describe("fromEntries", () => {
  it("builds an object from pairs", () => {
    expect(
      fromEntries([
        ["a", 1],
        ["b", 2],
      ]),
    ).toEqual({ a: 1, b: 2 });
  });

  it("round-trips Object.entries", () => {
    const source = { a: 1, b: { c: 2 } };
    expect(fromEntries(Object.entries(source))).toEqual(source);
  });

  it("accepts any iterable of pairs, not just arrays", () => {
    expect(fromEntries(new Map([["a", 1]]))).toEqual({ a: 1 });
  });

  it("lets the last pair win on a repeated key", () => {
    expect(
      fromEntries([
        ["a", 1],
        ["a", 2],
      ]),
    ).toEqual({ a: 2 });
  });

  it("returns an empty object for an empty source", () => {
    expect(fromEntries([])).toEqual({});
  });
});
