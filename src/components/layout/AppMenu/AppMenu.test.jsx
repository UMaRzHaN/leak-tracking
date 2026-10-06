import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_PAGES } from "@/app/pages";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

// Выбор проекта проверяется своим тестом: здесь — только что меню его зовёт.
const platform = vi.hoisted(() => ({ android: false }));
vi.mock("@/services/sync/localSyncPlatform", () => ({
  isNativeAndroid: () => platform.android,
}));

vi.mock("./ProjectPicker", () => ({
  default: () => <button type="button">Project picker</button>,
}));

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
    expect(screen.getByText("34 open")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /LDAR/ }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("closes itself before every navigation", () => {
    const { onClose, onSelectModule, onEditProfile, setPage } = renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Inventory" }));
    fireEvent.click(screen.getByRole("button", { name: "Import data" }));
    fireEvent.click(screen.getByRole("button", { name: /Change name/ }));

    expect(onSelectModule).toHaveBeenCalledWith("inventory");
    expect(setPage).toHaveBeenCalledWith("import");
    expect(onEditProfile).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledTimes(3);
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

  it("offers repair work with the number of repairs in progress", () => {
    const { onSelectModule } = renderMenu({ repairCount: 12 });

    expect(screen.getByText("12 in work")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Repair work/ }));
    expect(onSelectModule).toHaveBeenCalledWith("repairs");
  });

  it("shows how many tags are left in the current round", () => {
    renderMenu({ monitoringDueCount: 7 });
    expect(screen.getByText("7 to check")).toBeTruthy();
  });

  it("says nothing about tags without an active round", () => {
    renderMenu({ monitoringDueCount: null });
    expect(screen.queryByText(/to check/)).toBeNull();
  });

  it("builds the ZIP backup from the menu, once at a time", () => {
    const onExportBackup = vi.fn();
    renderMenu({ onExportBackup });
    fireEvent.click(screen.getByRole("button", { name: /Backup \(ZIP\)/ }));
    expect(onExportBackup).toHaveBeenCalledOnce();
  });

  it("shows that a backup is already being prepared", () => {
    const onExportBackup = vi.fn();
    renderMenu({ onExportBackup, exportingBackup: true });
    expect(screen.getByText("preparing…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Backup \(ZIP\)/ }));
    expect(onExportBackup).not.toHaveBeenCalled();
  });

  it("offers sync only in the Android app, where it opens its section", () => {
    renderMenu();
    expect(screen.queryByRole("button", { name: "Sync" })).toBeNull();
  });

  it("opens the sync section from the menu on Android", () => {
    platform.android = true;
    try {
      const { onOpenSettings } = renderMenu();
      fireEvent.click(screen.getByRole("button", { name: "Sync" }));
      expect(onOpenSettings).toHaveBeenCalledWith("sync");
    } finally {
      platform.android = false;
    }
  });
});
