import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ project: "upstream" }),
}));

const RouteSheet = (await import("./RouteSheet")).default;

const leak = (id, lng, extra = {}) => ({
  id,
  leak_id: id.toUpperCase(),
  lat: 46.2,
  lng,
  deposit: "Tengiz",
  location: `Pad ${id}`,
  ...extra,
});

function renderSheet(props = {}) {
  const handlers = { onClose: vi.fn(), onShowMap: vi.fn(), onStart: vi.fn() };
  render(
    <RouteSheet
      open
      leaks={[
        leak("far", 53.5),
        leak("near", 53.21),
        leak("fixing", 53.3, { status: "in_progress" }),
      ]}
      coords={{ lat: 46.2, lng: 53.2 }}
      gpsEnabled
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("RouteSheet", () => {
  it("orders open leaks from the current position and starts with that order", () => {
    const { onStart } = renderSheet();

    const names = screen
      .getAllByRole("listitem")
      .slice(1)
      .map((item) => item.textContent);
    expect(names[0]).toContain("Pad near");
    expect(names[1]).toContain("Pad far");

    fireEvent.click(screen.getByRole("button", { name: "Start route" }));
    expect(onStart).toHaveBeenCalledWith(["near", "far"]);
  });

  it("switches to leaks under repair", () => {
    const { onStart } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Under repair" }));
    fireEvent.click(screen.getByRole("button", { name: "Start route" }));

    expect(onStart).toHaveBeenCalledWith(["fixing"]);
  });

  it("says so without GPS and cannot start an empty route", () => {
    renderSheet({ gpsEnabled: false, leaks: [] });

    expect(
      screen.getByText("GPS is off — ordered from the first point"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start route" }).disabled).toBe(
      true,
    );
  });
});
