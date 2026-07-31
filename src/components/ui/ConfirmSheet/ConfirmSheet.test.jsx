import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConfirmSheet from "./ConfirmSheet";

describe("ConfirmSheet async actions", () => {
  it("prevents duplicate actions and closing while confirmation is pending", async () => {
    let finish;
    const onConfirm = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onCancel = vi.fn();
    render(
      <ConfirmSheet
        open
        title="Delete project?"
        description="This operation takes time."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { name: "Delete" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" }).disabled).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => {
      finish();
    });

    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Delete" }).disabled).toBe(false);
  });

  it("reports a rejected action and re-enables the dialog", async () => {
    const error = new Error("storage unavailable");
    const onActionError = vi.fn();
    render(
      <ConfirmSheet
        open
        title="Clear data?"
        description="Confirm cleanup."
        onConfirm={vi.fn().mockRejectedValue(error)}
        onCancel={vi.fn()}
        onActionError={onActionError}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Подтвердить" }));

    await act(async () => {});
    expect(onActionError).toHaveBeenCalledWith(error);
    expect(screen.getByRole("button", { name: "Подтвердить" }).disabled).toBe(
      false,
    );
  });
});
