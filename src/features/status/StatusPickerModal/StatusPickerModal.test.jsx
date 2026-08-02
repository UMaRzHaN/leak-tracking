import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StatusPickerModal from "./StatusPickerModal";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    t: (_key, options) => options?.defaultValue ?? _key,
  }),
}));

describe("StatusPickerModal", () => {
  it("exposes a labelled dialog and closes with Escape", () => {
    const onClose = vi.fn();
    render(
      <StatusPickerModal current="open" onSelect={vi.fn()} onClose={onClose} />,
    );

    expect(screen.getByRole("dialog", { name: "Change status" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("offers only the next strict lifecycle transition", () => {
    render(
      <StatusPickerModal current="open" onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("В ремонте")).toBeTruthy();
    expect(screen.queryByText("Устранена")).toBeNull();
  });
});
