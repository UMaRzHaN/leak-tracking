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
