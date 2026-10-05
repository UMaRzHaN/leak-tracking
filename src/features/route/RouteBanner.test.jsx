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
};

describe("RouteBanner", () => {
  it("shows the step, the target, the distance and what is left", () => {
    const onFocus = vi.fn();
    const onCheck = vi.fn();
    render(
      <RouteBanner
        progress={{ total: 124, done: 36, left: 88, step: 37, current: target }}
        coords={{ lat: 46.2, lng: 53.2 }}
        gpsEnabled
        onFocus={onFocus}
        onCheck={onCheck}
        onEnd={vi.fn()}
      />,
    );

    expect(screen.getByText("Route · point 37 of 124")).toBeTruthy();
    expect(screen.getByText("Pad 12")).toBeTruthy();
    expect(screen.getByText("88 left")).toBeTruthy();
    expect(screen.getByText(/m$/)).toBeTruthy();

    fireEvent.click(screen.getByText("Pad 12"));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(onFocus).toHaveBeenCalledWith(target);
    expect(onCheck).toHaveBeenCalledWith(target);
  });

  it("reports a finished route and still lets it be closed", () => {
    const onEnd = vi.fn();
    render(
      <RouteBanner
        progress={{ total: 2, done: 2, left: 0, step: 2, current: null }}
        coords={null}
        gpsEnabled={false}
        onFocus={vi.fn()}
        onCheck={vi.fn()}
        onEnd={onEnd}
      />,
    );

    expect(screen.getByText("Route complete")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "End route" }));
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
