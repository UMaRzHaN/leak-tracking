import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setCurrentPosition } from "@/app/currentPosition";
import { SHOW_ON_MAP_EVENT, takeMapFocus } from "@/app/mapFocus";
import { translate } from "@/test/translate";
import LeakLocationSection from "./LeakLocationSection";

// Снимок карты лениво грузит Leaflet и слой тайлов. Тест кончался раньше, чем
// модуль успевал выполниться: он оставался скомпилированным в процессе
// воркера без блочных счётчиков, и тест слоя тайлов, попавший в тот же
// процесс, на Linux терял половину ветвей покрытия (CI падал на пороге
// cachedTileLayer.js). Карта здесь не проверяется, как и в карточке
// компонента.
vi.mock("./CoordsMapPreview", () => ({
  default: () => <div data-testid="map-preview" />,
}));

const fields = [
  { key: "lat", label: "Latitude" },
  { key: "lng", label: "Longitude" },
];

const props = {
  fields,
  localeTexts: { empty: { coords: "No coordinates" } },
  t: translate,
};

describe("LeakLocationSection", () => {
  afterEach(() => {
    setCurrentPosition(null);
    takeMapFocus();
  });

  it("показывает расстояние от человека и ведёт на карту (5e)", () => {
    setCurrentPosition({ lat: 41.311081, lng: 69.240562 });
    const onShow = vi.fn();
    window.addEventListener(SHOW_ON_MAP_EVENT, onShow);
    render(
      <LeakLocationSection
        {...props}
        data={{ lat: 41.3113, lng: 69.240562 }}
      />,
    );

    expect(screen.getByText("From you")).toBeInTheDocument();
    expect(screen.getByText("24 m")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show on map" }));
    expect(onShow).toHaveBeenCalled();
    expect(takeMapFocus()).toEqual({ lat: 41.3113, lng: 69.240562 });
    window.removeEventListener(SHOW_ON_MAP_EVENT, onShow);
  });

  it("не пишет «от вас» без GPS", () => {
    render(<LeakLocationSection {...props} data={{ lat: 41.3, lng: 69.2 }} />);
    expect(screen.queryByText("From you")).not.toBeInTheDocument();
  });

  it("подписывает координаты радиусом приёмника", () => {
    render(
      <LeakLocationSection
        {...props}
        data={{ lat: 41.311081, lng: 69.240562, coords_accuracy: 12 }}
      />,
    );

    expect(screen.getByText("41.311081")).toBeInTheDocument();
    expect(screen.getByText("Coordinate accuracy")).toBeInTheDocument();
    expect(screen.getByText("±12 m")).toBeInTheDocument();
  });

  it("не показывает точность, когда её не записали", () => {
    // Записи, заведённые до появления поля, — обычный случай, а не ошибка.
    render(<LeakLocationSection {...props} data={{ lat: 41.3, lng: 69.2 }} />);

    expect(screen.queryByText(/Coordinate accuracy/)).not.toBeInTheDocument();
  });

  it("молчит про точность у записи без координат", () => {
    // Радиус без точки, к которой он относится, не значит ничего.
    render(<LeakLocationSection {...props} data={{ coords_accuracy: 12 }} />);

    expect(screen.getByText("No coordinates")).toBeInTheDocument();
    expect(screen.queryByText("±12 m")).not.toBeInTheDocument();
  });

  it("не выводит испорченный радиус", () => {
    render(
      <LeakLocationSection
        {...props}
        data={{ lat: 41.3, lng: 69.2, coords_accuracy: -5 }}
      />,
    );

    expect(screen.queryByText(/Coordinate accuracy/)).not.toBeInTheDocument();
  });
});
