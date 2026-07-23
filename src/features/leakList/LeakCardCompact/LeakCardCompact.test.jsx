import { render, screen } from "@testing-library/react";
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

vi.mock("@/utils/priority", () => ({ getPriorityMeta: () => null }));
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
vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (_key, options = {}) => options.defaultValue ?? _key,
  }),
}));
vi.mock("@/features/photos/PhotoViewer/PhotoViewer", () => ({
  default: () => null,
}));

import LeakCardCompact from "./LeakCardCompact";

function renderCard(leak) {
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
    />,
  );
}

describe("LeakCardCompact location hierarchy", () => {
  it("shows location, object, and component in their new order", () => {
    const { container } = renderCard({
      location: "Compressor room",
      object: "Compressor 1",
      component: "Valve 7",
    });

    const bodyText = container.textContent;
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

  it("shows a standalone component in the component row", () => {
    renderCard({ component: "Valve 7" });

    expect(screen.getByText("Valve 7")).toBeTruthy();
    expect(screen.getByText("◉")).toBeTruthy();
  });
});
