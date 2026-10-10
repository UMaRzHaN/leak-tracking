import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({
    projectName: "Копия !Database_LDAR_PHASE_II",
    project: "upstream",
  }),
}));

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    lang: "ru",
    t: (key) =>
      ({
        "header.menu": "Меню",
        "header.defaultProject": "Проект",
        "header.gpsOnTitle": "Выключить GPS",
        "header.gpsOffTitle": "Включить GPS",
        "header.gpsOn": "GPS вкл",
        "header.gpsOff": "GPS выкл",
        "header.gpsSearch": "Поиск GPS",
        "header.gpsError": "Ошибка GPS",
      })[key] ?? key,
  }),
}));

import Header from "./Header";

describe("Header", () => {
  it("opens the menu, goes home and toggles GPS", () => {
    const setPage = vi.fn();
    const setGpsEnabled = vi.fn();
    const onMenuOpen = vi.fn();

    render(
      <Header
        setPage={setPage}
        coords={{ lat: 0, lng: 69.232593 }}
        gpsEnabled
        setGpsEnabled={setGpsEnabled}
        onMenuOpen={onMenuOpen}
      />,
    );

    expect(screen.getByText("Копия !Database_LDAR_PHASE_II")).toBeTruthy();
    // Координаты ушли из строки шапки в подсказку кнопки GPS.
    expect(
      screen.getByRole("button", { name: "Выключить GPS" }).title,
    ).toContain("0.000000 / 69.232593");

    fireEvent.click(screen.getByTitle("Копия !Database_LDAR_PHASE_II"));
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    fireEvent.click(screen.getByRole("button", { name: "Выключить GPS" }));

    expect(setPage).toHaveBeenCalledWith("");
    expect(onMenuOpen).toHaveBeenCalledOnce();
    expect(setGpsEnabled).toHaveBeenCalledOnce();
  });

  it("does not display stale coordinates while GPS is disabled", () => {
    render(
      <Header
        setPage={vi.fn()}
        coords={{ lat: 41.3, lng: 69.2 }}
        gpsEnabled={false}
        setGpsEnabled={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Включить GPS" }).title,
    ).not.toContain("41.300000");
    expect(screen.getByText("GPS выкл")).toBeTruthy();
  });

  function renderWithScope(scope) {
    const onLocationScopeOpen = vi.fn();
    render(
      <Header
        setPage={vi.fn()}
        coords={null}
        gpsEnabled={false}
        setGpsEnabled={vi.fn()}
        locationScope={{
          available: true,
          setPath: vi.fn(),
          scopedCount: null,
          path: [],
          ...scope,
        }}
        onLocationScopeOpen={onLocationScopeOpen}
      />,
    );
    return { onLocationScopeOpen };
  }

  it("shows the selected location path with its leak count", () => {
    renderWithScope({ path: ["УМГ-2", "КС-5"], scopedCount: 42 });

    expect(screen.getByText("УМГ-2 › КС-5")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("opens the browser and clears the selection", () => {
    const setPath = vi.fn();
    const { onLocationScopeOpen } = renderWithScope({
      path: ["УМГ-2"],
      setPath,
    });

    fireEvent.click(screen.getByText("УМГ-2"));
    fireEvent.click(
      screen.getByRole("button", { name: "locationScope.reset" }),
    );

    expect(onLocationScopeOpen).toHaveBeenCalledOnce();
    expect(setPath).toHaveBeenCalledWith([]);
  });

  it("offers no reset while nothing is selected", () => {
    renderWithScope({ path: [] });

    expect(screen.getByText("locationScope.all")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "locationScope.reset" }),
    ).toBeNull();
  });

  it("does not claim a path when several locations are selected", () => {
    renderWithScope({ path: null });

    // A multi-value filter is not a path; naming one of its values would
    // misrepresent the rest.
    expect(screen.getByText("locationScope.several")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "locationScope.reset" }),
    ).toBeTruthy();
  });

  it("stays out of the way for a project type with no location levels", () => {
    render(
      <Header
        setPage={vi.fn()}
        coords={null}
        gpsEnabled={false}
        setGpsEnabled={vi.fn()}
        locationScope={{ available: false, path: [], setPath: vi.fn() }}
      />,
    );

    expect(screen.queryByText("locationScope.all")).toBeNull();
  });
});
