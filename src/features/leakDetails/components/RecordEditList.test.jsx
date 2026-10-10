import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const { default: RecordEditList } = await import("./RecordEditList");

const leak = {
  events: [
    {
      id: "i1",
      type: "inspection",
      date: "2026-10-05T10:00:00.000Z",
      roundNumber: 2,
      result: "resolved",
      physicalTag: true,
    },
  ],
};

function Harness({ onEdits }) {
  const [edits, setEdits] = useState({});
  onEdits(edits);
  return (
    <RecordEditList
      leak={leak}
      kind="inspection"
      edits={edits}
      setEdits={setEdits}
    />
  );
}

describe("RecordEditList", () => {
  it("показывает ответы записи и правит их в черновике", () => {
    const onEdits = vi.fn();
    render(<Harness onEdits={onEdits} />);

    const tag = screen.getByRole("radiogroup", {
      name: "Physical tag present?",
    });
    expect(
      within(tag)
        .getByRole("radio", { name: "Yes" })
        .getAttribute("aria-checked"),
    ).toBe("true");

    fireEvent.click(within(tag).getByRole("radio", { name: "No" }));
    expect(onEdits).toHaveBeenLastCalledWith({ i1: { physicalTag: false } });
    expect(
      within(tag)
        .getByRole("radio", { name: "No" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
});
