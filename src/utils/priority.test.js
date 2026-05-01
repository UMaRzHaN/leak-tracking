import { priorityFromSpeed, PRIORITY } from "./priority";

describe("priorityFromSpeed", () => {
  it("returns CRITICAL for speed >= 100", () => {
    expect(priorityFromSpeed(100)).toBe(PRIORITY.CRITICAL);
    expect(priorityFromSpeed(999)).toBe(PRIORITY.CRITICAL);
  });

  it("returns HIGH for speed in [50, 100)", () => {
    expect(priorityFromSpeed(50)).toBe(PRIORITY.HIGH);
    expect(priorityFromSpeed(99)).toBe(PRIORITY.HIGH);
  });

  it("returns MEDIUM for speed in [10, 50)", () => {
    expect(priorityFromSpeed(10)).toBe(PRIORITY.MEDIUM);
    expect(priorityFromSpeed(49)).toBe(PRIORITY.MEDIUM);
  });

  it("returns LOW for speed in (0, 10)", () => {
    expect(priorityFromSpeed(0.1)).toBe(PRIORITY.LOW);
    expect(priorityFromSpeed(9)).toBe(PRIORITY.LOW);
  });

  it("returns null for zero", () => {
    expect(priorityFromSpeed(0)).toBeNull();
  });

  it("returns null for negative values", () => {
    expect(priorityFromSpeed(-1)).toBeNull();
    expect(priorityFromSpeed(-100)).toBeNull();
  });

  it("returns null for NaN", () => {
    expect(priorityFromSpeed(NaN)).toBeNull();
  });

  it("returns null for null", () => {
    expect(priorityFromSpeed(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(priorityFromSpeed(undefined)).toBeNull();
  });

  it("handles string numbers", () => {
    expect(priorityFromSpeed("100")).toBe(PRIORITY.CRITICAL);
    expect(priorityFromSpeed("9")).toBe(PRIORITY.LOW);
  });

  it("boundary: exactly 50 is HIGH not MEDIUM", () => {
    expect(priorityFromSpeed(50)).toBe(PRIORITY.HIGH);
    expect(priorityFromSpeed(49.9)).toBe(PRIORITY.MEDIUM);
  });

  it("boundary: exactly 10 is MEDIUM not LOW", () => {
    expect(priorityFromSpeed(10)).toBe(PRIORITY.MEDIUM);
    expect(priorityFromSpeed(9.9)).toBe(PRIORITY.LOW);
  });
});
