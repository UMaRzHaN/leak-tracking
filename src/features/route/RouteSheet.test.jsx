import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ project: "upstream", activeProject: { id: "p1" } }),
}));
const round = vi.hoisted(() => ({ current: null }));
vi.mock("@/utils/monitoringRound", () => ({
  readMonitoringRound: () => round.current,
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
        leak("checked", 53.25, {
          events: [
            {
              type: "inspection",
              date: "2026-10-01T10:00:00.000Z",
              roundId: "r1",
              roundNumber: 1,
            },
          ],
        }),
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
  it("routes every leak still to check in the round, whatever its status", () => {
    round.current = { id: "r1", number: 1 };
    const { onStart } = renderSheet();

    // Нет переключателя набора: мониторинг идёт по всем биркам.
    expect(screen.queryByRole("button", { name: "Under repair" })).toBeNull();
    const names = screen
      .getAllByRole("listitem")
      .slice(1)
      .map((item) => item.textContent);
    expect(names[0]).toContain("Pad near");

    fireEvent.click(screen.getByRole("button", { name: "Start route" }));
    // Проверенная в этом обходе в маршрут не попадает.
    expect(onStart).toHaveBeenCalledWith(["near", "fixing", "far"]);
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
