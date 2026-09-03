import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { translate } from "@/test/translate";
import LeakLocationSection from "./LeakLocationSection";

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
