import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FilterBar from "./FilterBar";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key, options) => options?.defaultValue ?? key,
  }),
}));

function props(overrides = {}) {
  return {
    search: "",
    setSearch: vi.fn(),
    statusFilter: [],
    setFilter: vi.fn(),
    priorityFilter: [],
    setPriorityFilter: vi.fn(),
    locationFilter: null,
    setLocationFilter: vi.fn(),
    locationKey: "deposit",
    locationOptions: ["Kashagan", "Tengiz"],
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

describe("FilterBar shared location filter", () => {
  it("does not show a separate location summary", () => {
    render(
      <FilterBar
        {...props({
          locationFilter: { key: "deposit", values: ["Kashagan"] },
        })}
      />,
    );

    expect(screen.queryByText("Deposit:")).toBeNull();
    expect(screen.queryByRole("button", { name: "Kashagan" })).toBeNull();
  });

  it("allows changing the shared selection from status-style chips", () => {
    const setLocationFilter = vi.fn();
    render(<FilterBar {...props({ setLocationFilter })} />);

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const kashagan = screen.getByRole("button", { name: "Kashagan" });
    const tengiz = screen.getByRole("button", { name: "Tengiz" });
    expect(kashagan.getAttribute("aria-pressed")).toBe("true");
    expect(tengiz.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(kashagan);
    const update = setLocationFilter.mock.calls[0][0];
    expect(update(null)).toEqual({ key: "deposit", values: ["Tengiz"] });
  });

  it("removes the filter when every location is selected again", () => {
    const setLocationFilter = vi.fn();
    const current = { key: "deposit", values: ["Kashagan"] };
    render(
      <FilterBar {...props({ locationFilter: current, setLocationFilter })} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Tengiz" }));
    const update = setLocationFilter.mock.calls[0][0];
    expect(update(current)).toBeNull();
  });

  it("shows an empty selection through inactive location chips", () => {
    render(
      <FilterBar
        {...props({ locationFilter: { key: "deposit", values: [] } })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen
        .getByRole("button", { name: "Kashagan" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
