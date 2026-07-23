import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MapControls from "./MapControls";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    lang: "ru",
    t: (_key, options) => options?.defaultValue ?? _key,
  }),
}));

function renderControls(overrides = {}) {
  const props = {
    onLocate: vi.fn(),
    onOpenSheet: vi.fn(),
    onDownload: vi.fn(),
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
  it("opens inside the map controls and selects a monitoring state", () => {
    const props = renderControls();

    fireEvent.click(
      screen.getByRole("button", { name: "Фильтр по мониторингу" }),
    );

    const monitoringOptions = ["Все теги", "К проверке", "Проверено"].map(
      (name) => screen.getByRole("button", { name }),
    );
    expect(
      [...monitoringOptions[0].parentElement.querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).toEqual(["Все теги", "К проверке", "Проверено"]);
    expect(monitoringOptions[1].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Проверено" }));
    expect(props.onMonitoringChange).toHaveBeenCalledWith("checked");
  });

  it("keeps all tags selected when no monitoring round exists", () => {
    const props = renderControls({
      hasMonitoringRound: false,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Фильтр по мониторингу" }),
    );
    expect(
      screen
        .getByRole("button", { name: "Все теги" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "К проверке" }));
    expect(props.onMonitoringChange).toHaveBeenCalledWith("all");
  });
});
