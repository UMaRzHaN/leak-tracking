import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MobileSheet from "./MobileSheet";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({ lang: "en" }),
}));

const kashaganLeak = {
  id: "leak-1",
  leak_id: "1001",
  deposit: "Кашаганское",
  object: "Компрессорная станция",
};
const tengizLeak = {
  id: "leak-2",
  leak_id: "1002",
  deposit: "Тенгизское",
  object: "Насосная станция",
};

function sheetProps(overrides = {}) {
  return {
    open: true,
    leaks: [kashaganLeak, tengizLeak],
    locations: ["Кашаганское", "Тенгизское"],
    locationLabel: "Deposit",
    enabledLocations: { Кашаганское: true, Тенгизское: false },
    onToggleLocation: vi.fn(),
    onClose: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
}

describe("MobileSheet tag search", () => {
  it("searches only by tag number and keeps every location checkbox visible", async () => {
    render(<MobileSheet {...sheetProps()} />);
    const search = screen.getByRole("searchbox", {
      name: "Search by tag number",
    });

    fireEvent.change(search, { target: { value: "1001" } });
    await waitFor(() => expect(screen.getByText(/1001/)).toBeTruthy());
    expect(screen.queryByText(/1002/)).toBeNull();

    const kashagan = screen.getByRole("checkbox", { name: "Кашаганское" });
    const tengiz = screen.getByRole("checkbox", { name: "Тенгизское" });
    expect(kashagan.checked).toBe(true);
    expect(tengiz.checked).toBe(false);
  });

  it("does not search leak cards by location or object text", async () => {
    render(<MobileSheet {...sheetProps()} />);
    const search = screen.getByRole("searchbox", {
      name: "Search by tag number",
    });

    fireEvent.change(search, { target: { value: "Кашаганское" } });
    await waitFor(() => expect(screen.getByText("Nothing found")).toBeTruthy());
    expect(screen.getByRole("checkbox", { name: "Кашаганское" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Тенгизское" })).toBeTruthy();
  });
});
