import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const ResultsBar = (await import("./ResultsBar")).default;

function renderBar(props) {
  return render(
    <ResultsBar
      visibleCount={3}
      statusFilter="all"
      sortAsc
      onSortToggle={vi.fn()}
      allDisplayedSelected={false}
      onClearSelection={vi.fn()}
      onSelectDisplayed={vi.fn()}
      onMonitorSelected={vi.fn()}
      onEditBulkCalculation={vi.fn()}
      {...props}
    />,
  );
}

describe("ResultsBar", () => {
  it("говорит, сколько выбранного скрыто фильтром", () => {
    renderBar({ selectedCount: 1, hiddenSelectedCount: 2 });

    expect(screen.getByText("1 selected of 3")).toBeTruthy();
    expect(screen.getByText("2 more selected, hidden by filters")).toBeTruthy();
  });

  it("не прячет панель, когда весь выбор скрыт, но действовать не даёт", () => {
    renderBar({ selectedCount: 0, hiddenSelectedCount: 2 });

    expect(screen.getByText("2 more selected, hidden by filters")).toBeTruthy();
    expect(screen.getByText("Check").closest("button")?.disabled).toBe(true);
    expect(
      screen.getByText("Clear selection").closest("button")?.disabled,
    ).toBe(false);
  });
});
