import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ActiveProjectCard from "./ActiveProjectCard";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const project = {
  id: "p1",
  name: "Tengiz",
  type: "upstream",
  syncId: "abc-123",
  folderName: "Tengiz",
};

function renderCard() {
  const props = {
    project,
    objectsCount: 9,
    onOpenObjects: vi.fn(),
    onRename: vi.fn(),
    onChangeSyncId: vi.fn(),
  };
  render(<ActiveProjectCard {...props} />);
  return props;
}

describe("ActiveProjectCard", () => {
  it("renames the project in place", () => {
    const props = renderCard();
    fireEvent.click(screen.getByTitle("Rename"));
    const input = screen.getByDisplayValue("Tengiz");
    fireEvent.change(input, { target: { value: "Tengiz Q1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onRename).toHaveBeenCalledWith("Tengiz Q1");
  });

  it("shows the sync id and opens its editor", () => {
    const props = renderCard();
    expect(screen.getByText("abc-123")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Change syncId"));
    expect(props.onChangeSyncId).toHaveBeenCalled();
  });

  it("has no delete action — that lives in the danger zone", () => {
    renderCard();
    expect(screen.queryByRole("button", { name: /Delete project/ })).toBeNull();
  });
});
