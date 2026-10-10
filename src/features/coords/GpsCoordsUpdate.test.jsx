import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setCurrentPosition } from "@/app/currentPosition";
import GpsCoordsUpdate from "./GpsCoordsUpdate";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

describe("GpsCoordsUpdate", () => {
  afterEach(() => setCurrentPosition(null));

  it("offers the current GPS position with how far the point moves", () => {
    setCurrentPosition({ lat: 41.3113, lng: 69.240562, accuracy: 5 });
    const onApply = vi.fn();
    render(
      <GpsCoordsUpdate
        current={{ lat: 41.311081, lng: 69.240562 }}
        applied={null}
        onApply={onApply}
      />,
    );

    expect(
      screen.getByText(/the point moves 24 m · accuracy ±5 m/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(onApply).toHaveBeenCalledWith({
      lat: 41.3113,
      lng: 69.240562,
      accuracy: 5,
    });
  });

  it("cannot update without a GPS position", () => {
    render(<GpsCoordsUpdate current={null} applied={null} onApply={vi.fn()} />);
    expect(screen.getByText("GPS is off or has no position yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update" }).disabled).toBe(true);
  });

  it("lets the update be undone before saving", () => {
    const onApply = vi.fn();
    render(
      <GpsCoordsUpdate
        current={null}
        applied={{ lat: 41.3, lng: 69.2, accuracy: 4 }}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onApply).toHaveBeenCalledWith(null);
  });
});
