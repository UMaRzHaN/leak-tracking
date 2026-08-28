import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_PAGES } from "@/app/pages";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const Footer = (await import("./Footer")).default;

const upstream = { id: "p1", type: "upstream" };
// Тип без объявленного блока реестра: все настоящие типы его теперь ведут.
const withoutRegistry = { id: "p2", type: "unknown" };

function renderFooter(project, page = "") {
  const setPage = vi.fn();
  render(
    <Footer page={page} setPage={setPage} openCount={0} project={project} />,
  );
  return setPage;
}

describe("Footer navigation", () => {
  it("only offers pages the app can actually navigate to", () => {
    // The allow-list rewrites anything unknown to home without a word, so a
    // tab added here and forgotten there reads as a button that does nothing.
    const setPage = renderFooter(upstream);

    for (const button of screen.getAllByRole("button")) {
      setPage.mockClear();
      button.click();
      if (setPage.mock.calls.length === 0) continue;
      expect(APP_PAGES.has(setPage.mock.calls[0][0])).toBe(true);
    }
  });

  it("shows the registry for a project type that declares one", () => {
    renderFooter(upstream);
    expect(screen.getByLabelText("Registry")).toBeTruthy();
  });

  it("hides the registry for a project type without one", () => {
    renderFooter(withoutRegistry);
    expect(screen.queryByLabelText("Registry")).toBeNull();
  });

  it("hides the registry when no project is open yet", () => {
    renderFooter(null);
    expect(screen.queryByLabelText("Registry")).toBeNull();
  });

  it("navigates to the registry", () => {
    const setPage = renderFooter(upstream);
    screen.getByLabelText("Registry").click();
    expect(setPage).toHaveBeenCalledWith("components");
  });
});
