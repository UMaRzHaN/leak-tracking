import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useModalDialog } from "./useModalDialog";

function DialogFixture({ onClose }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onClose();
  };
  const ref = useModalDialog({ open, onClose: close });
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      {open && (
        <div ref={ref} role="dialog" tabIndex={-1}>
          <button>first</button>
          <button>last</button>
        </div>
      )}
    </>
  );
}

describe("useModalDialog", () => {
  it("focuses the dialog, traps Tab, closes on Escape and restores focus", async () => {
    const onClose = vi.fn();
    render(<DialogFixture onClose={onClose} />);
    const opener = screen.getByText("open");
    opener.focus();
    fireEvent.click(opener);

    const first = screen.getByText("first");
    const last = screen.getByText("last");
    await waitFor(() => expect(document.activeElement).toBe(first));
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
  });
});
