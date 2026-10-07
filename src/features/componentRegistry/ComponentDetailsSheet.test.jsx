import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ComponentDetailsSheet from "./ComponentDetailsSheet";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/app/currentPosition", () => ({
  useCurrentPosition: () => ({ lat: 38.5, lng: 66.2, accuracy: 7.6 }),
}));
// Снимок карты — Leaflet, в jsdom ему рисовать нечем.
vi.mock("@/features/leakDetails/components/CoordsMapPreview", () => ({
  default: () => <div data-testid="map-preview" />,
}));

const fields = [
  { key: "lat", label: "Latitude", coord: true, viewable: true },
  { key: "lng", label: "Longitude", coord: true, viewable: true },
];
const component = {
  id: "c1",
  component_uid: "0001",
  lat: 38.481685,
  lng: 66.160629,
  coords_accuracy: 30,
};

function open(onSave = vi.fn(async () => {})) {
  render(
    <ComponentDetailsSheet
      component={component}
      fields={fields}
      onSave={onSave}
      onClose={() => {}}
    />,
  );
  return onSave;
}

describe("ComponentDetailsSheet coordinates", () => {
  it("shows the point on a map like the leak card", () => {
    open();
    fireEvent.click(screen.getByText("Coordinates"));
    expect(screen.getByTestId("map-preview")).toBeTruthy();
    expect(screen.getByText("38.481685")).toBeTruthy();
    expect(screen.getByRole("button", { name: /map/i })).toBeTruthy();
  });

  it("takes the point from GPS together with the receiver radius", async () => {
    const onSave = open();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByText("Coordinates"));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      lat: 38.5,
      lng: 66.2,
      coords_accuracy: 8,
    });
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("__gps");
  });

  it("drops the old radius when the point is typed by hand", async () => {
    const onSave = open();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByText("Coordinates"));
    fireEvent.change(screen.getByLabelText("Latitude"), {
      target: { value: "38.49" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].coords_accuracy).toBeUndefined();
  });
});

describe("ComponentDetailsSheet reconciliation log", () => {
  it("lists inspections newest first with round, state and comment", () => {
    render(
      <ComponentDetailsSheet
        component={{
          ...component,
          history: [
            {
              action: "component_created",
              date: "2026-10-01T09:00:00Z",
              user: "М",
            },
            {
              action: "component_inspected",
              date: "2026-10-02T09:00:00Z",
              user: "Азиз",
              to: "В резерве",
            },
            {
              action: "component_inspected",
              date: "2026-10-07T09:00:00Z",
              user: "Азиз",
              to: "Законсервирован",
              comment: "Течи нет",
              roundNumber: 4,
            },
          ],
        }}
        fields={fields}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Reconciliation"));

    const badges = screen
      .getAllByText(/^(Round № 4|Inspection)$/)
      .map((node) => node.textContent);
    expect(badges).toEqual(["Round № 4", "Inspection"]);
    expect(screen.getByText("Течи нет")).toBeTruthy();
    expect(screen.getByText("Законсервирован")).toBeTruthy();
    // Заведение карточки — не осмотр, в лог сверок не попадает.
    expect(screen.queryByText("М")).toBeNull();
  });
});
