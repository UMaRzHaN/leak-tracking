import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

  it("waits for persistence and blocks submit and close while saving", async () => {
    let finishSave;
    const onConfirm = vi.fn(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        }),
    );
    const onClose = vi.fn();
    render(
      <ReopenLeakModal
        leak={{
          id: "leak-1",
          leak_id: "1001",
          equipmentType: "pink bag",
        }}
        vars={{}}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(
      screen
        .getByRole("dialog", { name: "Reopen leak" })
        .getAttribute("aria-busy"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "Saving…" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" }).disabled).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledOnce();

    await act(async () => {
      finishSave();
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open" }).disabled).toBe(false),
    );
  });

  it("keeps the modal open and reports a rejected save", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockRejectedValue(new Error("database locked"));
    render(
      <ReopenLeakModal
        leak={{
          id: "leak-1",
          leak_id: "1001",
          equipmentType: "pink bag",
        }}
        vars={{}}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Failed to reopen leak",
    );
    expect(screen.getByRole("dialog", { name: "Reopen leak" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open" }).disabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });
});
