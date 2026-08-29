import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NEARBY } from "@/domain/leakFilters";

vi.mock("react-i18next", async () => {
  const { translate } = await import("@/test/translate");
  return { useTranslation: () => ({ t: translate, i18n: { language: "en" } }) };
});

// Карточка и виртуализация проверяются своими тестами. Здесь важно другое:
// какой из трёх пустых экранов показан и что список получает на вход.
vi.mock("@/features/leakList/VirtualizedLeakList/VirtualizedLeakList", () => ({
  default: ({ items, renderItem, height, bottomPadding }) => (
    <div
      data-testid="virtualized"
      data-height={height}
      data-pad={bottomPadding}
    >
      {items.map((leak) => (
        <div key={leak.id}>{renderItem(leak)}</div>
      ))}
    </div>
  ),
}));
vi.mock("@/features/leakList/LeakCardCompact/LeakCardCompact", () => ({
  default: ({ leak, selected, nearbyDist }) => (
    <div data-testid="card" data-selected={String(selected)}>
      {leak.leak_id}
      {nearbyDist != null && <span>{`${nearbyDist} м`}</span>}
    </div>
  ),
}));

const LeakList = (await import("./LeakList")).default;

const leaks = [
  { id: "a", leak_id: "TAG-1" },
  { id: "b", leak_id: "TAG-2", _nearbyDist: 42 },
];

function renderList(props = {}) {
  return render(
    <LeakList
      items={leaks}
      search=""
      statusFilter="all"
      selectedIds={new Set()}
      onOpenDetails={vi.fn()}
      onPickStatus={vi.fn()}
      onMonitor={vi.fn()}
      onToggleSelect={vi.fn()}
      {...props}
    />,
  );
}

describe("LeakList", () => {
  it("отдаёт записи виртуализированному списку", () => {
    renderList();

    expect(screen.getAllByTestId("card")).toHaveLength(2);
    expect(screen.getByText("TAG-1")).toBeInTheDocument();
  });

  it("отмечает выбранные карточки и доносит расстояние", () => {
    renderList({ selectedIds: new Set(["b"]) });

    const cards = screen.getAllByTestId("card");
    expect(cards[0]).toHaveAttribute("data-selected", "false");
    expect(cards[1]).toHaveAttribute("data-selected", "true");
    expect(screen.getByText("42 м")).toBeInTheDocument();
  });

  describe("пустой экран объясняет причину пустоты", () => {
    it("пустой проект — это не то же самое, что пустой поиск", () => {
      renderList({ items: [] });

      expect(screen.getByText("No records")).toBeInTheDocument();
      expect(screen.queryByTestId("virtualized")).not.toBeInTheDocument();
    });

    it("ничего не нашлось по запросу", () => {
      renderList({ items: [], search: "ЗД32" });

      expect(screen.getByText("Nothing found")).toBeInTheDocument();
    });

    it("рядом ничего нет — с радиусом, в котором искали", () => {
      renderList({ items: [], statusFilter: NEARBY });

      expect(screen.getByText("No leaks within 500 m")).toBeInTheDocument();
    });

    it("запрос важнее фильтра близости: искали всё-таки по нему", () => {
      renderList({ items: [], search: "ЗД32", statusFilter: NEARBY });

      expect(screen.getByText("Nothing found")).toBeInTheDocument();
      expect(screen.queryByText(/within/)).not.toBeInTheDocument();
    });
  });

  it("оставляет место под панель действий внизу экрана", () => {
    renderList();

    expect(screen.getByTestId("virtualized")).toHaveAttribute("data-pad", "88");
  });
});
