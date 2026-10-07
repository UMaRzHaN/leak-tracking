import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Карточка утечки проверяется своим тестом; здесь — дают ли ей «Проверить».
vi.mock("./MapLeakCard", () => ({
  default: ({ onMonitor }) => <div>{onMonitor ? "can-check" : "no-check"}</div>,
}));
vi.mock("./MapComponentCard", () => ({ default: () => null }));

const MapPinCard = (await import("./MapPinCard")).default;
const resolved = { id: "l1", status: "resolved" };

describe("MapPinCard", () => {
  it("в ремонтах даёт проверить и принятый ремонт, если правило пускает", () => {
    render(
      <MapPinCard
        pin={resolved}
        module="repairs"
        onMonitor={vi.fn()}
        canCheckRepair={() => true}
      />,
    );
    expect(screen.getByText("can-check")).toBeTruthy();
  });

  it("не даёт, когда правило не пускает (принят до идущего обхода)", () => {
    render(
      <MapPinCard
        pin={resolved}
        module="repairs"
        onMonitor={vi.fn()}
        canCheckRepair={() => false}
      />,
    );
    expect(screen.getByText("no-check")).toBeTruthy();
  });

  it("в LDAR «Проверить» нет", () => {
    render(<MapPinCard pin={resolved} module="ldar" onMonitor={vi.fn()} />);
    expect(screen.getByText("no-check")).toBeTruthy();
  });
});
