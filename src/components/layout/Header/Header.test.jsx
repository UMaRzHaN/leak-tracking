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
        "header.appTitle": "Журнал утечек газа",
        "header.defaultProject": "Проект",
        "header.gpsOnTitle": "Выключить GPS",
        "header.gpsOffTitle": "Включить GPS",
        "header.gpsOn": "GPS вкл",
        "header.gpsOff": "GPS выкл",
        "header.gpsSearch": "Поиск GPS",
        "header.gpsError": "Ошибка GPS",
        "header.settings": "Настройки",
      })[key] ?? key,
  }),
}));

import Header from "./Header";

describe("Header", () => {
  it("keeps project information and actions separated in the compact layout", () => {
    const setPage = vi.fn();
    const setGpsEnabled = vi.fn();
    const onUserProfileOpen = vi.fn();

    render(
      <Header
        setPage={setPage}
        coords={{ lat: 0, lng: 69.232593 }}
        gpsEnabled
        setGpsEnabled={setGpsEnabled}
        userProfile={{ name: "Inspector" }}
        onUserProfileOpen={onUserProfileOpen}
      />,
    );

    expect(screen.getByText("Копия !Database_LDAR_PHASE_II")).toBeTruthy();
    expect(screen.getByText("0.000000 / 69.232593")).toBeTruthy();

    fireEvent.click(screen.getByTitle("Копия !Database_LDAR_PHASE_II"));
    fireEvent.click(screen.getByRole("button", { name: "Inspector" }));
    fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
    fireEvent.click(screen.getByRole("button", { name: "Выключить GPS" }));

    expect(setPage).toHaveBeenNthCalledWith(1, "");
    expect(setPage).toHaveBeenNthCalledWith(2, "settings");
    expect(onUserProfileOpen).toHaveBeenCalledOnce();
    expect(setGpsEnabled).toHaveBeenCalledOnce();
  });

  it("does not display stale coordinates while GPS is disabled", () => {
    render(
      <Header
        setPage={vi.fn()}
        coords={{ lat: 41.3, lng: 69.2 }}
        gpsEnabled={false}
        setGpsEnabled={vi.fn()}
        userProfile={{ name: "Inspector" }}
        onUserProfileOpen={vi.fn()}
      />,
    );

    expect(screen.queryByText("41.300000 / 69.200000")).toBeNull();
    expect(screen.getByText("GPS выкл")).toBeTruthy();
  });
});
