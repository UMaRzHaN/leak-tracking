import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_PAGES } from "@/app/pages";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const AppMenu = (await import("./AppMenu")).default;

function renderMenu(props = {}) {
  const handlers = {
    onClose: vi.fn(),
    setPage: vi.fn(),
    onOpenSettings: vi.fn(),
    onEditProfile: vi.fn(),
    onSelectModule: vi.fn(),
  };
  render(
    <AppMenu
      open
      page=""
      projectName="Тенгиз Q1 2026"
      userProfile={{ name: "Иван Ермеков" }}
      openCount={34}
      showRegistry
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("AppMenu", () => {
  it("shows the user, the project and the open count of the current module", () => {
    renderMenu();

    expect(screen.getByRole("dialog", { name: "Иван Ермеков" })).toBeTruthy();
    expect(screen.getByText("Тенгиз Q1 2026")).toBeTruthy();
    expect(screen.getByText("34 open")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /LDAR/ }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("closes itself before every navigation", () => {
    const { onClose, setPage, onOpenSettings, onEditProfile } = renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Inventory" }));
    fireEvent.click(screen.getByRole("button", { name: "Import data" }));
    fireEvent.click(screen.getByRole("button", { name: /Change name/ }));
    fireEvent.click(screen.getByTitle("Switch project"));

    expect(setPage).toHaveBeenCalledWith("components");
    expect(onOpenSettings).toHaveBeenCalledWith("backup");
    expect(onOpenSettings).toHaveBeenCalledWith("projects");
    expect(onEditProfile).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it("only leads to pages the app knows", () => {
    const { setPage } = renderMenu();

    for (const button of screen.getAllByRole("button")) fireEvent.click(button);

    for (const [target] of setPage.mock.calls)
      expect(APP_PAGES.has(target)).toBe(true);
  });

  it("hides inventory for a project without a registry", () => {
    renderMenu({ showRegistry: false });
    expect(screen.queryByRole("button", { name: "Inventory" })).toBeNull();
  });

  it("asks for a name when the profile has none", () => {
    renderMenu({ userProfile: null });
    expect(screen.getByText("No name set")).toBeTruthy();
  });

  it("switches the module instead of jumping to a page", () => {
    const { onSelectModule, setPage } = renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Monitoring" }));

    expect(onSelectModule).toHaveBeenCalledWith("monitoring");
    expect(setPage).not.toHaveBeenCalled();
  });

  it("marks the active module", () => {
    renderMenu({ module: "monitoring" });
    expect(
      screen
        .getByRole("button", { name: "Monitoring" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("button", { name: /LDAR/ }).getAttribute("aria-current"),
    ).toBeNull();
  });
});
