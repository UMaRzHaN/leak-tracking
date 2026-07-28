import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReopenLeakModal from "./ReopenLeakModal";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({ lang: "en" }),
}));
vi.mock("@/features/calculationParameters/CalculationParametersForm", () => ({
  default: ({ submitted, texts }) => (
    <div>
      Calculation form
      {submitted ? <span>{texts.serialNumberRequired}</span> : null}
    </div>
  ),
}));

describe("ReopenLeakModal", () => {
  it("treats a whitespace-only serial number as missing", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ReopenLeakModal
        leak={{
          id: "leak-1",
          leak_id: "1001",
          equipmentType: "GFM 2.0",
          serial_number: "   ",
        }}
        vars={{}}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Calculation parameters" }),
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Calculation parameters" }),
    ).toBeNull();
    expect(screen.getByRole("dialog", { name: "Reopen leak" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
