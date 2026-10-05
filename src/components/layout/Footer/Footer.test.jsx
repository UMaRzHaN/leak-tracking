import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_PAGES } from "@/app/pages";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const Footer = (await import("./Footer")).default;

function renderFooter(page = "", openCount = 0) {
  const setPage = vi.fn();
  render(<Footer page={page} setPage={setPage} openCount={openCount} />);
  return setPage;
}

describe("Footer navigation", () => {
  it("only offers pages the app can actually navigate to", () => {
    // The allow-list rewrites anything unknown to home without a word, so a
    // tab added here and forgotten there reads as a button that does nothing.
    const setPage = renderFooter();

    for (const button of screen.getAllByRole("button")) {
      setPage.mockClear();
      button.click();
      if (setPage.mock.calls.length === 0) continue;
      expect(APP_PAGES.has(setPage.mock.calls[0][0])).toBe(true);
    }
  });

  it("leaves the registry to the menu", () => {
    // Инвентаризация — отдельный модуль, её вход в бургер-меню.
    renderFooter();
    expect(screen.queryByLabelText("Registry")).toBeNull();
  });

  it("marks the current tab and caps the open badge", () => {
    renderFooter("db", 140);
    expect(screen.getByLabelText("Database").getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByText("99+")).toBeTruthy();
  });
});
