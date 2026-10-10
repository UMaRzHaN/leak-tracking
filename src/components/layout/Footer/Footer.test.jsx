import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_PAGES } from "@/app/pages";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const Footer = (await import("./Footer")).default;

function renderFooter(page = "", openCount = 0, props = {}) {
  const setPage = vi.fn();
  render(
    <Footer page={page} setPage={setPage} openCount={openCount} {...props} />,
  );
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

  it("offers adding a leak only in LDAR", () => {
    renderFooter();
    expect(screen.getByLabelText("Add Leak")).toBeTruthy();
    expect(screen.queryByLabelText("Round")).toBeNull();
  });

  it("puts the route in the middle of the monitoring module", () => {
    const onRoute = vi.fn();
    const setPage = renderFooter("", 0, { module: "monitoring", onRoute });

    expect(screen.queryByLabelText("Add Leak")).toBeNull();
    screen.getByLabelText("Build a route").click();
    screen.getByLabelText("Round").click();

    expect(onRoute).toHaveBeenCalledOnce();
    expect(setPage).toHaveBeenCalledWith("monitoring");
    expect(screen.getByLabelText("Records")).toBeTruthy();
  });

  it("gives the repairs module its own panel without adding leaks", () => {
    renderFooter("", 0, { module: "repairs" });
    expect(screen.queryByLabelText("Add Leak")).toBeNull();
    expect(screen.getByLabelText("Records")).toBeTruthy();
  });

  it("counts the tags left in the round on the database tab in monitoring", () => {
    renderFooter("", 3, {
      module: "monitoring",
      remainingCount: 12,
      onRoute: () => {},
    });
    expect(
      screen.getByRole("button", { name: "Database" }).textContent,
    ).toContain("12");
    expect(screen.getByRole("button", { name: "Round" }).textContent).toBe(
      "Round",
    );
  });

  it("hides the database badge in monitoring when nothing is left", () => {
    renderFooter("", 3, { module: "monitoring", remainingCount: 0 });
    expect(screen.getByRole("button", { name: "Database" }).textContent).toBe(
      "Database",
    );
  });

  it("counts unaccepted repairs on the database tab in repairs", () => {
    renderFooter("", 3, { module: "repairs", remainingCount: 7 });
    expect(
      screen.getByRole("button", { name: "Database" }).textContent,
    ).toContain("7");
  });
});
