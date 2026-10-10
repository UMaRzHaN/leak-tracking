import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

import Notification from "./Notification";

describe("Notification", () => {
  it("renders the toast in the document root and closes from its button", () => {
    const onClose = vi.fn();
    const host = document.createElement("section");
    document.body.appendChild(host);

    render(
      <Notification
        notification={{ type: "success", message: "Saved" }}
        onClose={onClose}
        autoCloseMs={0}
      />,
      { container: host },
    );

    const alert = screen.getByRole("alert");
    expect(alert.parentElement).toBe(document.body);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("закрывается по таймеру, даже если onClose новый на каждом рендере", () => {
    // Карта перерисовывается с каждой отметкой GPS и передаёт новую стрелку:
    // таймер перезапускался и тост не закрывался.
    vi.useFakeTimers();
    try {
      const notification = { type: "info", message: "GPS" };
      const closed = vi.fn();
      const { rerender } = render(
        <Notification notification={notification} onClose={() => closed()} />,
      );
      for (let second = 0; second < 4; second += 1) {
        act(() => vi.advanceTimersByTime(1000));
        rerender(
          <Notification notification={notification} onClose={() => closed()} />,
        );
      }
      expect(closed).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
