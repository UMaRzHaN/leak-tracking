import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MapControls from "./MapControls";
import { MODULE } from "@/app/modules/activeModule";
import { mapFiltersFor } from "@/pages/MapPage/mapModuleFilters";

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

// Отборы живут в шторке «Фильтры карты» (5d) — сперва её открыть.
function openFilters() {
  fireEvent.click(screen.getByRole("button", { name: "Map filters" }));
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
    openFilters();

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
    openFilters();

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

describe("filters chosen by the module", () => {
  it("offers no base switch: the module decides what the map shows", () => {
    renderControls({ filters: mapFiltersFor(MODULE.LDAR) });
    openFilters();
    expect(screen.queryByRole("button", { name: /Switch base/ })).toBeNull();
  });

  it("gives monitoring its round, fictions and tags, but not status or priority", () => {
    renderControls({
      filters: mapFiltersFor(MODULE.MONITORING),
      onFictionChange: vi.fn(),
      onTagChange: vi.fn(),
    });
    openFilters();

    expect(
      screen.getByRole("button", { name: "Monitoring filter" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fiction filter" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Physical tag filter" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Status filter" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Priority filter" }),
    ).toBeNull();
  });

  it("keeps LDAR on status and priority, without the round or fictions", () => {
    renderControls({
      filters: mapFiltersFor(MODULE.LDAR),
      onFictionChange: vi.fn(),
      onTagChange: vi.fn(),
    });
    openFilters();

    // Фикция — итог осмотра в обходе, это вопрос мониторинга.
    expect(screen.queryByRole("button", { name: "Fiction filter" })).toBeNull();

    expect(screen.getByRole("button", { name: "Status filter" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Monitoring filter" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Physical tag filter" }),
    ).toBeNull();
  });

  it("gives repairs the work stage instead of the leak status", () => {
    const onStageChange = vi.fn();
    renderControls({
      filters: mapFiltersFor(MODULE.REPAIRS),
      stageCounts: {
        all: 3,
        waiting_mtr: 1,
        in_repair: 2,
        ready: 0,
        accepted: 0,
      },
      onStageChange,
    });
    openFilters();

    expect(screen.queryByRole("button", { name: "Status filter" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stage filter" }));
    fireEvent.click(screen.getByRole("button", { name: /Under repair/ }));
    expect(onStageChange).toHaveBeenCalledWith("in_repair");
  });

  it("picks leaks with or without a tag", () => {
    const onTagChange = vi.fn();
    renderControls({
      filters: mapFiltersFor(MODULE.MONITORING),
      onTagChange,
      tagCounts: { with: 5, without: 2 },
    });
    openFilters();

    fireEvent.click(
      screen.getByRole("button", { name: "Physical tag filter" }),
    );
    // Счётчики у вариантов, «Все» — сумма отвеченных.
    expect(screen.getByRole("button", { name: /^All\s*7$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^No tag\s*2$/ }));
    expect(onTagChange).toHaveBeenCalledWith("without");
  });

  it("does not reset filters the module hides", () => {
    const props = renderControls({
      filters: mapFiltersFor(MODULE.MONITORING),
      statusFilters: ["open"],
      tagFilter: "with",
      onTagChange: vi.fn(),
    });
    openFilters();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(props.onTagChange).toHaveBeenCalledWith("all");
    expect(props.onStatusClear).not.toHaveBeenCalled();
  });

  it("drops the leak-only filters on the equipment base", () => {
    // Status, priority and the monitoring round describe how a leak is being
    // dealt with. A valve is not being dealt with, and a button that filters
    // nothing is worse than no button.
    renderControls();
    openFilters();
    expect(screen.getByRole("button", { name: "Status filter" })).toBeTruthy();

    cleanup();
    renderControls({ showsComponents: true });
    openFilters();

    expect(screen.queryByRole("button", { name: "Status filter" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Priority filter" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "My location" })).toBeTruthy();
  });
});

describe("the map's top bar (5d)", () => {
  it("searches from the bar and counts active filters on the filter button", () => {
    const props = renderControls({
      statusFilters: ["open"],
      priorityFilters: ["high"],
      moduleLabel: "Leaks",
    });

    fireEvent.click(screen.getByRole("button", { name: "Search leaks" }));
    expect(props.onOpenSheet).toHaveBeenCalled();
    // Статус, приоритет и «К проверке» в обходе.
    expect(
      screen.getByRole("button", { name: "Map filters" }).textContent,
    ).toBe("3");
  });

  it("resets every filter from the sheet", () => {
    const props = renderControls({ statusFilters: ["open"] });
    openFilters();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(props.onStatusClear).toHaveBeenCalled();
    expect(props.onMonitoringChange).toHaveBeenCalledWith("all");
  });
});
