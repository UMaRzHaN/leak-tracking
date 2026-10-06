import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/hooks/usePhotoSrc", () => ({ usePhotoSrc: () => null }));

const MapLeakCard = (await import("./MapLeakCard")).default;

const leak = {
  id: "l1",
  leak_id: "1043",
  status: "open",
  lat: 41.3113,
  lng: 69.240562,
  location: "Pad 12",
  object: "Separator A",
  component: "Valve",
  leak_description: "Flange",
  leak_speed: 3.4,
  Total_Annual_Methane_Loss_m3_y: 788,
  Emissions_t_CO2eq_year: 15.02,
};

describe("MapLeakCard (5d)", () => {
  it("shows what the list card shows and hands both actions back", () => {
    const onMonitor = vi.fn();
    const onOpen = vi.fn();
    render(
      <MapLeakCard
        leak={leak}
        coords={{ lat: 41.311081, lng: 69.240562 }}
        onMonitor={onMonitor}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByText("№ 1043")).toBeTruthy();
    expect(screen.getByText("24 m")).toBeTruthy();
    expect(screen.getByText("Pad 12")).toBeTruthy();
    expect(screen.getByText("Separator A")).toBeTruthy();
    expect(screen.getByText("Valve · Flange")).toBeTruthy();
    expect(screen.getByText(/3\.4/)).toBeTruthy();
    expect(screen.getByText(/~788/)).toBeTruthy();
    expect(screen.getByText(/~15\.02/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(onMonitor).toHaveBeenCalledWith(leak);
    fireEvent.click(screen.getByRole("button", { name: "Open record" }));
    expect(onOpen).toHaveBeenCalledWith(leak);
  });

  it("offers no check outside the monitoring round", () => {
    render(
      <MapLeakCard
        leak={leak}
        coords={null}
        onMonitor={null}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
  });
});
