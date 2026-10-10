import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ObjectsScreen from "./ObjectsScreen";
import { listProjectObjects } from "../projectObjects";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const objects = listProjectObjects(
  [
    { field: "Alan", unit: "Block 4", location: "Adsorber-1" },
    { field: "Alan", unit: "Block 4", location: "Adsorber-2" },
    { field: "Alan", unit: "Block 5", location: "Adsorber-9" },
    { field: "Pamuk", unit: "Block 1", location: "Well 3" },
  ],
  ["field", "unit", "location"],
);

describe("ObjectsScreen by levels", () => {
  it("goes from the first level down to objects and back up", () => {
    const onClose = vi.fn();
    render(<ObjectsScreen objects={objects} onClose={onClose} />);

    // Первый уровень — месторождения.
    expect(screen.getByText("Alan")).toBeTruthy();
    expect(screen.getByText("Pamuk")).toBeTruthy();
    expect(screen.queryByText("Block 4")).toBeNull();

    fireEvent.click(screen.getByText("Alan"));
    expect(screen.getByText("Block 4")).toBeTruthy();
    expect(screen.getByText("Block 5")).toBeTruthy();
    expect(screen.queryByText("Pamuk")).toBeNull();

    fireEvent.click(screen.getByText("Block 4"));
    expect(screen.getByText("Adsorber-1")).toBeTruthy();
    expect(screen.getByText("Adsorber-2")).toBeTruthy();
    expect(screen.queryByText("Adsorber-9")).toBeNull();

    // «Назад» поднимает на уровень выше, а с первого — закрывает экран.
    const back = screen.getByRole("button", { name: "Back" });
    fireEvent.click(back);
    expect(screen.getByText("Block 5")).toBeTruthy();
    fireEvent.click(back);
    expect(screen.getByText("Pamuk")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(back);
    expect(onClose).toHaveBeenCalled();
  });

  it("finds objects across the whole project by search", () => {
    render(<ObjectsScreen objects={objects} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "adsorber-9" },
    });
    expect(screen.getByText("Adsorber-9")).toBeTruthy();
    expect(screen.getByText("Alan › Block 5")).toBeTruthy();
    expect(screen.queryByText("Adsorber-1")).toBeNull();
  });
});
