import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FilterBar from "./FilterBar";

// Resolves against the real English locale, so these assertions fail if the
// screen loses a translation rather than quietly falling back to the key.
vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

function props(overrides = {}) {
  return {
    search: "",
    setSearch: vi.fn(),
    statusFilter: [],
    setFilter: vi.fn(),
    priorityFilter: [],
    setPriorityFilter: vi.fn(),
    nearbyFilter: false,
    setNearbyFilter: vi.fn(),
    nearbyRadius: 500,
    setNearbyRadius: vi.fn(),
    nearbyRadiusOptions: [100, 500, 1000],
    counts: { all: 3, open: 2, in_progress: 0, resolved: 1, nearby: 0 },
    hasGps: false,
    ...overrides,
  };
}

describe("FilterBar", () => {
  it("filters by status and priority", () => {
    const setFilter = vi.fn();
    render(<FilterBar {...props({ setFilter })} />);

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Priority")).toBeTruthy();
  });

  it("offers no location controls", () => {
    // Location moved to the header's folder browser. Two controls writing the
    // same three filters is the duplication this removal was about, so the
    // absence is the behaviour worth pinning.
    render(<FilterBar {...props()} />);

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    expect(screen.queryByText("Deposit")).toBeNull();
    expect(screen.queryByText("Subdivision")).toBeNull();
    expect(screen.queryByRole("button", { name: "Kashagan" })).toBeNull();
  });

  it("does not mark the filter button active for a location selection", () => {
    // The badge tracks what this panel can change; a location chosen in the
    // browser is shown by the header breadcrumb instead.
    render(<FilterBar {...props()} />);

    expect(
      screen.getByRole("button", { name: "Filters" }).querySelector("span"),
    ).toBeNull();
  });
});
