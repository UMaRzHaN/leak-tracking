import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ project: "upstream" }),
}));

const RouteBanner = (await import("./RouteBanner")).default;

const target = {
  id: "a",
  leak_id: "1043",
  lat: 46.2,
  lng: 53.21,
  location: "Pad 12",
  status: "open",
  component: "Flange DN50",
  leak_description: "Gasket seep",
};

describe("RouteBanner", () => {
  it("shows the tag with its component, then step, distance and status", () => {
    const onFocus = vi.fn();
    render(
      <RouteBanner
        progress={{ total: 124, done: 36, left: 88, step: 37, current: target }}
        coords={{ lat: 46.2, lng: 53.2 }}
        gpsEnabled
        onFocus={onFocus}
        onEnd={vi.fn()}
      />,
    );

    expect(screen.getByText(/^.+ 1043 · Flange DN50$/)).toBeTruthy();
    expect(screen.getByText(/^37\/124 · .+ · Open$/)).toBeTruthy();
    expect(screen.queryByText(/Gasket seep/)).toBeNull();
    expect(screen.queryByText(/Pad 12/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /point 37 of 124/ }));
    expect(onFocus).toHaveBeenCalledWith(target);
  });

  it("reports a finished route and still lets it be closed", () => {
    const onEnd = vi.fn();
    render(
      <RouteBanner
        progress={{ total: 2, done: 2, left: 0, step: 2, current: null }}
        coords={null}
        gpsEnabled={false}
        onFocus={vi.fn()}
        onEnd={onEnd}
      />,
    );

    expect(screen.getByText("Route complete")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "End route" }));
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("asks before ending an unfinished route", () => {
    const onEnd = vi.fn();
    render(
      <RouteBanner
        progress={{ total: 124, done: 36, left: 88, step: 37, current: target }}
        coords={null}
        gpsEnabled={false}
        onFocus={vi.fn()}
        onEnd={onEnd}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "End route" }));
    expect(onEnd).not.toHaveBeenCalled();
    expect(screen.getByText(/Points left: 88/)).toBeTruthy();

    const ends = screen.getAllByRole("button", { name: "End route" });
    fireEvent.click(ends[ends.length - 1]);
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
