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

  it("shows repair stages instead of statuses in the repairs module", () => {
    const setFilter = vi.fn();
    render(<FilterBar {...props({ setFilter, repairMode: true })} />);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    expect(screen.getByText("Repair stage")).toBeTruthy();
    expect(screen.queryByText("Status")).toBeNull();
    // «Ожидает МТР» — та же открытая утечка: отбор идёт по статусу.
    fireEvent.click(screen.getByRole("button", { name: /Awaiting materials/ }));
    const update = setFilter.mock.calls[0][0];
    expect(update([])).toEqual(["open"]);
  });

  it("offers the physical tag only where it is asked for", () => {
    const setTagFilter = vi.fn();
    const counts = { ...props().counts, tagWith: 4, tagWithout: 2 };
    const { unmount } = render(<FilterBar {...props({ counts })} />);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.queryByText("Physical tag")).toBeNull();
    unmount();

    render(<FilterBar {...props({ counts, setTagFilter })} />);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByText("Physical tag")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /No tag/ }));
    expect(setTagFilter).toHaveBeenCalledWith("without");
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
