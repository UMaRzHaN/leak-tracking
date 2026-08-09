import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onCLS: vi.fn(),
  onFCP: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
}));

vi.mock("web-vitals", () => mocks);

const { reportWebVitals } = await import("./reportWebVitals");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reportWebVitals", () => {
  it("subscribes to every metric the library still ships", () => {
    reportWebVitals();

    // Named imports rather than a namespace call, so a rename in web-vitals
    // breaks the build; this guards the set itself staying complete.
    for (const subscribe of Object.values(mocks)) {
      expect(subscribe).toHaveBeenCalledTimes(1);
      expect(subscribe).toHaveBeenCalledWith(expect.any(Function));
    }
  });

  it("hands every metric the same reporter", () => {
    reportWebVitals();

    const reporters = Object.values(mocks).map((fn) => fn.mock.calls[0][0]);
    expect(new Set(reporters).size).toBe(1);
  });
});
