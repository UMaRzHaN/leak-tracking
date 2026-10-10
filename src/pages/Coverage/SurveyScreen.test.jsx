import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SurveyScreen from "./SurveyScreen";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const leaks = [
  { category: "Compression" },
  { category: "Processing" },
  { category: "Well" },
];

function renderSurvey(onSave = vi.fn()) {
  render(
    <SurveyScreen
      survey={{
        slice: "category",
        groups: [{ id: "g1", name: "Well", checked: 2, estimate: 5 }],
      }}
      leaks={leaks}
      levelKeys={[]}
      onSave={onSave}
      onClose={() => {}}
    />,
  );
  return onSave;
}

const chips = () =>
  within(screen.getByRole("group", { name: "Categories from records" }))
    .getAllByRole("button")
    .map((button) => button.textContent);

describe("SurveyScreen suggestions", () => {
  it("shows categories from records as chips, without the ones added", () => {
    renderSurvey();
    expect(chips()).toEqual(["Compression", "Processing"]);
  });

  it("narrows the chips by the typed text and adds one on tap", () => {
    const onSave = renderSurvey();
    fireEvent.change(screen.getByLabelText("Add a category"), {
      target: { value: "proc" },
    });
    expect(chips()).toEqual(["Processing"]);

    fireEvent.click(screen.getByRole("button", { name: "Processing" }));
    expect(screen.getByLabelText("Add a category")).toHaveValue("");
    expect(chips()).toEqual(["Compression"]);

    fireEvent.click(screen.getByRole("button", { name: "Save survey" }));
    expect(onSave.mock.calls[0][0].groups.map((group) => group.name)).toEqual([
      "Well",
      "Processing",
    ]);
  });
});

describe("SurveyScreen place", () => {
  const placedLeaks = [
    { subdivision: "North", category: "Compression" },
    { subdivision: "South", category: "Processing" },
    { subdivision: "North", category: "Well" },
  ];

  function renderPlaced(placePath, onSave = vi.fn()) {
    render(
      <SurveyScreen
        survey={{
          slice: "category",
          groups: [{ id: "g1", name: "Well", checked: 2, estimate: 5 }],
        }}
        leaks={placedLeaks}
        levelKeys={["subdivision"]}
        placePath={placePath}
        onSave={onSave}
        onClose={() => {}}
      />,
    );
    return onSave;
  }

  it("files new groups under the selected place and suggests its records", () => {
    const onSave = renderPlaced(["North"]);
    // «Well» без места не занимает имя в «North»: там своя группа.
    expect(chips()).toEqual(["Compression", "Well"]);
    fireEvent.click(screen.getByRole("button", { name: "Compression" }));
    fireEvent.click(screen.getByRole("button", { name: "Save survey" }));
    expect(onSave.mock.calls[0][0].groups).toEqual([
      { id: "g1", name: "Well", checked: 2, estimate: 5 },
      expect.objectContaining({ name: "Compression", place: ["North"] }),
    ]);
  });

  it("assigns a group to the place and back to the whole project", () => {
    const onSave = renderPlaced(["North"]);
    fireEvent.click(screen.getByRole("button", { name: "Assign to “North”" }));
    expect(screen.getByText("North")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Whole project" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign to “North”" }));
    fireEvent.click(screen.getByRole("button", { name: "Save survey" }));
    expect(onSave.mock.calls[0][0].groups[0].place).toEqual(["North"]);
  });

  it("keeps groups project-wide without a single selected place", () => {
    const onSave = renderPlaced(null);
    expect(
      screen.queryByRole("button", { name: /Assign to/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Compression" }));
    fireEvent.click(screen.getByRole("button", { name: "Save survey" }));
    expect(onSave.mock.calls[0][0].groups[1]).not.toHaveProperty("place");
  });
});
