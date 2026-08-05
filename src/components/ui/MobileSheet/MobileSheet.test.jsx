import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MobileSheet from "./MobileSheet";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

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
    onClose: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
}

describe("MobileSheet tag search", () => {
  it("exposes a keyboard-accessible dialog and selectable leak buttons", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<MobileSheet {...sheetProps({ onSelect, onClose })} />);

    expect(screen.getByRole("dialog", { name: "Map filters" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /1001/ }));
    expect(onSelect).toHaveBeenCalledWith(kashaganLeak);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("searches only by tag number", async () => {
    render(<MobileSheet {...sheetProps()} />);
    const search = screen.getByRole("searchbox", {
      name: "Search by tag number",
    });

    fireEvent.change(search, { target: { value: "1001" } });
    await waitFor(() => expect(screen.getByText(/1001/)).toBeTruthy());
    expect(screen.queryByText(/1002/)).toBeNull();
  });

  it("does not search leak cards by location or object text", async () => {
    render(<MobileSheet {...sheetProps()} />);
    const search = screen.getByRole("searchbox", {
      name: "Search by tag number",
    });

    fireEvent.change(search, { target: { value: "Кашаганское" } });
    await waitFor(() => expect(screen.getByText("Nothing found")).toBeTruthy());
  });

  it("no longer offers location checkboxes", () => {
    // Location is picked in the header's folder browser. A second control over
    // the same filters is exactly the duplication this sheet was trimmed of.
    render(<MobileSheet {...sheetProps()} />);

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
