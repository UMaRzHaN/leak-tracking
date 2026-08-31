import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useSwipeCard", () => ({
  useSwipeCard: () => ({
    swipeState: null,
    swipeOffset: 0,
    close: vi.fn(),
    handlers: {},
  }),
}));

vi.mock("@/utils/status", () => ({
  getStatusMeta: () => ({
    label: "Open",
    color: "#000",
    bg: "#fff",
    border: "#ccc",
  }),
}));

vi.mock("@/utils/timeAgo", () => ({ timeAgo: () => "now" }));
vi.mock("@/hooks/usePhotoSrc", () => ({ usePhotoSrc: () => null }));
vi.mock("@/utils/monitoring", () => ({
  getLatestMonitoringPhotoPath: () => null,
}));
vi.mock("@/utils/locale", () => ({
  formatCompactNumber: (value) => String(value),
  formatLeakDate: () => "14.07.2026",
  formatNumber: (value) => String(value),
}));
vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/features/photos/PhotoViewer/PhotoViewer", () => ({
  default: () => null,
}));

import LeakCardCompact from "./LeakCardCompact";

function renderCard(leak, props = {}) {
  return render(
    <LeakCardCompact
      leak={{
        id: "leak-1",
        leak_id: "TAG-1",
        status: "open",
        createdAt: "2026-07-23T08:00:00.000Z",
        ...leak,
      }}
      onOpenDetails={vi.fn()}
      {...props}
    />,
  );
}

describe("LeakCardCompact location hierarchy", () => {
  it("shows location, object, and component in their new order", () => {
    const { container } = renderCard({
      location: "Compressor room",
      object: "Compressor 1",
      component: "Valve 7",
      leak_description: "Technical opening",
    });

    const bodyText = container.textContent;
    expect(screen.getByText("№ TAG-1")).toBeTruthy();
    expect(
      container.querySelector('[data-description-connector="true"]'),
    ).toBeTruthy();
    expect(screen.getByText("Technical opening")).toBeTruthy();
    expect(bodyText.indexOf("Compressor room")).toBeLessThan(
      bodyText.indexOf("Compressor 1"),
    );
    expect(bodyText.indexOf("Compressor 1")).toBeLessThan(
      bodyText.indexOf("Valve 7"),
    );
  });

  it("shows a standalone location without an empty component row", () => {
    renderCard({ location: "Compressor room" });

    expect(screen.getByText("Compressor room")).toBeTruthy();
    expect(screen.queryByText("◉")).toBeNull();
  });

  it("shows downstream address when location is absent", () => {
    renderCard({ address: "Refinery block 12", object: "Pump 4" });

    expect(screen.getByText("Refinery block 12")).toBeTruthy();
    expect(screen.getByText("Pump 4")).toBeTruthy();
  });
  it("shows a standalone component in the component row", () => {
    renderCard({ component: "Valve 7" });

    expect(screen.getByText("Valve 7")).toBeTruthy();
    expect(screen.getByText("◉")).toBeTruthy();
  });

  it("keeps the header and footer visible while collapsed and expands on click", () => {
    renderCard({
      location: "Compressor room",
      leak_speed: 18.12,
    });

    expect(screen.getByText(/TAG-1/)).toBeTruthy();
    expect(screen.getByText(/18.12/)).toBeTruthy();
    expect(screen.getByText("Compressor room")).toBeTruthy();

    const expandButton = screen.getByRole("button", { name: "Expand card" });
    const card = expandButton.closest("[data-urgency]");
    expect(expandButton.getAttribute("aria-expanded")).toBe("false");
    expect(card.className).toMatch(/collapsed/);
    fireEvent.click(expandButton);

    expect(card.className).not.toMatch(/collapsed/);
    expect(screen.getByRole("button", { name: "Collapse card" })).toBeTruthy();
  });
  it("does not toggle expansion from the selection control", () => {
    renderCard({}, { onToggleSelect: vi.fn() });

    const expandButton = screen.getByRole("button", { name: "Expand card" });
    const selectButton = screen.getByRole("button", { name: "Select leak" });
    fireEvent.keyDown(selectButton, { key: "Enter" });

    expect(expandButton.getAttribute("aria-expanded")).toBe("false");
  });
});
