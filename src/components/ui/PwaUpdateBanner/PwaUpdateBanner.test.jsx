import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PwaUpdateBanner from "./PwaUpdateBanner";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

describe("PwaUpdateBanner", () => {
  it("activates a waiting worker only after explicit user confirmation", () => {
    window.leakTrackingWaitingServiceWorkerRegistration = null;
    const postMessage = vi.fn();
    const addEventListener = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { addEventListener },
    });
    render(<PwaUpdateBanner />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("leak-tracking:update-available", {
          detail: { waiting: { postMessage } },
        }),
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    expect(addEventListener).toHaveBeenCalledWith(
      "controllerchange",
      expect.any(Function),
      { once: true },
    );
    expect(postMessage).toHaveBeenCalledWith({ type: "ACTIVATE_UPDATE" });
  });
});
