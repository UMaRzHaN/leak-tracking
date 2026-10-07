import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/hooks/usePhotoSrc", () => ({ usePhotoSrc: () => null }));

const MapComponentCard = (await import("./MapComponentCard")).default;

const component = {
  id: "c1",
  kind: "component",
  leak_id: "0001",
  component_status: "Законсервирован",
  component: "Кран шаровой",
  scheme_tag: "КШ-1",
  location: "Pad 12",
  object: "Separator A",
  lat: 41.3113,
  lng: 69.240562,
};

describe("MapComponentCard", () => {
  it("shows the hardware at the bottom and opens the full card", () => {
    const onOpen = vi.fn();
    render(
      <MapComponentCard
        component={component}
        coords={{ lat: 41.311081, lng: 69.240562 }}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByText("№ 0001")).toBeTruthy();
    expect(screen.getByText("Законсервирован")).toBeTruthy();
    expect(screen.getByText("Pad 12")).toBeTruthy();
    expect(screen.getByText("Separator A")).toBeTruthy();
    expect(screen.getByText(/Кран шаровой · .*КШ-1/)).toBeTruthy();

    // Без права на правку реестра сверять нечем — кнопки нет.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Open record" }));
    expect(onOpen).toHaveBeenCalledWith(component);
  });

  it("offers the same inspection as the registry", () => {
    const onCheck = vi.fn();
    render(
      <MapComponentCard
        component={component}
        coords={null}
        onCheck={onCheck}
        onOpen={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reconcile" }));
    expect(onCheck).toHaveBeenCalledWith(component);
  });
});
