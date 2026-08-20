import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const ProjectList = (await import("./ProjectList")).default;

const projects = [
  {
    id: "p1",
    name: "Tengiz Q1",
    type: "upstream",
    folderName: "tengiz_q1",
    syncId: "abc12345",
  },
  { id: "p2", name: "Omsk", type: "midstream", folderName: "omsk" },
];

function renderList() {
  const handlers = {
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onRemove: vi.fn(),
    onChangeSyncId: vi.fn(),
  };
  render(<ProjectList projects={projects} activeId="p1" {...handlers} />);
  return handlers;
}

const deleteButton = () => screen.getAllByTitle("Delete project")[0];
const renameButton = () => screen.getAllByTitle("Rename")[0];

describe("ProjectList", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("does not delete a project on the first press", async () => {
    // Проект — это все утечки и все фотографии по объекту. Один промах по
    // крестику не должен их стоить.
    const { onRemove } = renderList();

    fireEvent.click(deleteButton());

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText("Delete?")).toBeInTheDocument();
  });

  it("deletes only when the confirmation is pressed", () => {
    const { onRemove } = renderList();

    fireEvent.click(deleteButton());
    fireEvent.click(screen.getByText("Delete?"));

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("disarms itself after a few seconds, so a later press is harmless", () => {
    const { onRemove } = renderList();

    fireEvent.click(deleteButton());
    act(() => vi.advanceTimersByTime(3000));

    expect(screen.queryByText("Delete?")).not.toBeInTheDocument();
    fireEvent.click(deleteButton());
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("hides the neighbouring buttons while the delete is armed", () => {
    // Взведённое удаление занимает то же место, где стоят правка и смена
    // syncId: промахнуться в подтверждение, целясь в соседа, невозможно.
    renderList();
    const renameButtons = screen.getAllByTitle("Rename").length;

    fireEvent.click(deleteButton());
    expect(screen.getAllByTitle("Rename")).toHaveLength(renameButtons - 1);
    expect(screen.getAllByTitle("Change syncId")).toHaveLength(
      renameButtons - 1,
    );

    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getAllByTitle("Rename")).toHaveLength(renameButtons);
  });

  it("saves a new name on Enter and on losing focus", () => {
    const { onRename } = renderList();

    fireEvent.click(renameButton());
    const input = screen.getByDisplayValue("Tengiz Q1");
    fireEvent.change(input, { target: { value: "  Tengiz Q2  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("p1", "Tengiz Q2");

    fireEvent.click(renameButton());
    const again = screen.getByDisplayValue("Tengiz Q1");
    fireEvent.change(again, { target: { value: "Tengiz Q3" } });
    fireEvent.blur(again);

    expect(onRename).toHaveBeenLastCalledWith("p1", "Tengiz Q3");
  });

  it("does not report a rename that changes nothing", () => {
    const { onRename } = renderList();

    fireEvent.click(renameButton());
    const input = screen.getByDisplayValue("Tengiz Q1");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Tengiz Q1")).toBeInTheDocument();
  });

  it("drops the edit on Escape and keeps the old name", () => {
    const { onRename } = renderList();

    fireEvent.click(renameButton());
    const input = screen.getByDisplayValue("Tengiz Q1");
    fireEvent.change(input, { target: { value: "Wrong" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Tengiz Q1")).toBeInTheDocument();
  });

  it("passes the project on for selection and for a syncId change", () => {
    const { onSelect, onChangeSyncId } = renderList();

    fireEvent.click(screen.getByTitle("Select project"));
    expect(onSelect).toHaveBeenCalledWith("p2");

    fireEvent.click(screen.getAllByTitle("Change syncId")[0]);
    expect(onChangeSyncId).toHaveBeenCalledWith("p1", "abc12345");
  });
});
