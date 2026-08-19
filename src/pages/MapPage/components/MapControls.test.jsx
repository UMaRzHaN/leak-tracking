import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MapControls from "./MapControls";

// Resolves against the real English locale, so these assertions fail if the
// screen loses a translation rather than quietly falling back to the key.
vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

function renderControls(overrides = {}) {
  const props = {
    onLocate: vi.fn(),
    gpsEnabled: true,
    onOpenSheet: vi.fn(),
    onDownload: vi.fn(),
    onCancelDownload: vi.fn(),
    downloading: false,
    nearbyOnly: false,
    nearbyRadius: 100,
    nearbyRadiusOptions: [100, 500, 1000],
    priorityFilters: [],
    statusFilters: [],
    monitoringFilter: "due",
    hasMonitoringRound: true,
    hasGps: false,
    onToggleNearby: vi.fn(),
    onRadiusChange: vi.fn(),
    onPriorityToggle: vi.fn(),
    onPriorityClear: vi.fn(),
    onStatusToggle: vi.fn(),
    onStatusClear: vi.fn(),
    onMonitoringChange: vi.fn(),
    ...overrides,
  };

  render(<MapControls {...props} />);
  return props;
}

describe("MapControls monitoring filter", () => {
  it("does not request a location while GPS is disabled", () => {
    const props = renderControls({ gpsEnabled: false });
    const locate = screen.getByRole("button", { name: "My location" });

    expect(locate.disabled).toBe(true);
    fireEvent.click(locate);
    expect(props.onLocate).not.toHaveBeenCalled();
  });

  it("turns the active download control into a cancel action", () => {
    const props = renderControls({ downloading: true });

    fireEvent.click(
      screen.getByRole("button", { name: "Cancel map download" }),
    );
    expect(props.onCancelDownload).toHaveBeenCalledOnce();
    expect(props.onDownload).not.toHaveBeenCalled();
  });

  it("opens inside the map controls and selects a monitoring state", () => {
    const props = renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Monitoring filter" }));

    const monitoringOptions = ["All tags", "To check", "Checked"].map((name) =>
      screen.getByRole("button", { name }),
    );
    expect(
      [...monitoringOptions[0].parentElement.querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).toEqual(["All tags", "To check", "Checked"]);
    expect(monitoringOptions[1].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Checked" }));
    expect(props.onMonitoringChange).toHaveBeenCalledWith("checked");
  });

  it("keeps all tags selected when no monitoring round exists", () => {
    const props = renderControls({
      hasMonitoringRound: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "Monitoring filter" }));
    expect(
      screen
        .getByRole("button", { name: "All tags" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "To check" }));
    expect(props.onMonitoringChange).toHaveBeenCalledWith("all");
  });
});

describe("switching between the project's two bases", () => {
  it("offers no switch when the project type declares no registry", () => {
    renderControls({ componentsAvailable: false });
    expect(screen.queryByRole("button", { name: /Switch base/ })).toBeNull();
  });

  it("выделен отдельной кнопкой, а не ещё одной иконкой в столбце", () => {
    // Пока он выглядел как остальные кнопки, его читали как ещё один фильтр.
    renderControls({ componentsAvailable: true });
    const base = screen.getByRole("button", { name: /Switch base/ });
    const locate = screen.getByRole("button", { name: "My location" });

    expect(base.className).not.toBe(locate.className);
    expect(base.textContent).toMatch(/Leaks/);
  });

  it("называет базу, на которую смотрит человек", () => {
    renderControls({ componentsAvailable: true, showsComponents: true });

    expect(
      screen.getByRole("button", { name: /Switch base/ }).textContent,
    ).toMatch(/Assets/);
  });

  it("hands the switch back to the map", () => {
    const onToggleBase = vi.fn();
    renderControls({ componentsAvailable: true, onToggleBase });

    fireEvent.click(screen.getByRole("button", { name: /Switch base/ }));
    expect(onToggleBase).toHaveBeenCalled();
  });

  it("drops the leak-only filters on the equipment base", () => {
    // Status, priority and the monitoring round describe how a leak is being
    // dealt with. A valve is not being dealt with, and a button that filters
    // nothing is worse than no button.
    renderControls({ componentsAvailable: true });
    expect(screen.getByRole("button", { name: "Status filter" })).toBeTruthy();

    cleanup();
    renderControls({ componentsAvailable: true, showsComponents: true });

    expect(screen.queryByRole("button", { name: "Status filter" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Priority filter" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "My location" })).toBeTruthy();
  });
});
