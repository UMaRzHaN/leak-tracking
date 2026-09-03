import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { englishLanguageHook } from "@/test/translate";
import RepairAnalytics from "./RepairAnalytics";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook: hook } = await import("@/test/translate");
  return hook();
});

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 7, 1);
const at = (days) => new Date(START + days * DAY).toISOString();

const repaired = (id, spans) => ({
  id,
  leak_id: `TAG-${id}`,
  component: "Кран шаровой",
  events: spans.flatMap(([from, to], index) => [
    { id: `${id}-s${index}`, type: "repair_started", date: at(from) },
    ...(to == null
      ? []
      : [{ id: `${id}-d${index}`, type: "repair_done", date: at(to) }]),
  ]),
});

describe("RepairAnalytics", () => {
  it("не показывается, пока в проекте ничего не чинили", () => {
    const { container } = render(
      <RepairAnalytics leaks={[{ id: "1", status: "open" }]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("показывает вернувшуюся утечку с числом попыток", () => {
    render(
      <RepairAnalytics
        leaks={[
          repaired("14", [
            [0, 1],
            [5, 6],
          ]),
          repaired("22", [[0, 1]]),
        ]}
      />,
    );

    expect(screen.getByText("TAG-14")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
    // Починенная с первого раза в список возврата не попадает.
    expect(screen.queryByText("TAG-22")).not.toBeInTheDocument();
  });

  it("открывает карточку по нажатию на запись", () => {
    const onOpenLeak = vi.fn();
    const leak = repaired("14", [
      [0, 1],
      [5, 6],
    ]);

    render(<RepairAnalytics leaks={[leak]} onOpenLeak={onOpenLeak} />);
    fireEvent.click(screen.getByText("TAG-14"));

    expect(onOpenLeak).toHaveBeenCalledWith(leak);
  });

  it("подписывает блок словами из перевода, а не ключами", () => {
    render(<RepairAnalytics leaks={[repaired("14", [[0, 1]])]} />);

    expect(screen.getByRole("region", { name: "Repairs" })).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText(/usually repaired in 1 d/)).toBeInTheDocument();
  });

  it("считает незакрытую починку идущей, а не завершённой", () => {
    render(<RepairAnalytics leaks={[repaired("14", [[0, null]])]} />);

    expect(screen.getByText("in progress")).toBeInTheDocument();
    // Ремонт начат давно — про такой и написано.
    expect(screen.getByText(/oldest open repair/)).toBeInTheDocument();
  });

  it("молчит про починку, начатую только что", () => {
    // «Открыт 1 ч» через минуту после начала — это не предупреждение, а враньё
    // в той самой цифре, ради которой строку читают.
    const justStarted = {
      id: "14",
      events: [
        {
          id: "s",
          type: "repair_started",
          date: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
    };

    render(<RepairAnalytics leaks={[justStarted]} />);

    expect(screen.queryByText(/oldest open repair/)).not.toBeInTheDocument();
    expect(screen.getByText("in progress")).toBeInTheDocument();
  });
});

// Сторож на случай, если помощник перевода уедет: тест выше опирается на то,
// что он отдаёт настоящие английские строки.
describe("test translate helper", () => {
  it("resolves the repairs namespace", () => {
    expect(
      englishLanguageHook().useLanguage().t("mainPage.repairs.title"),
    ).toBe("Repairs");
  });
});
