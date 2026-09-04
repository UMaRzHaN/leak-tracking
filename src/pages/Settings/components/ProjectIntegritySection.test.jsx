import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectIntegritySection from "./ProjectIntegritySection";

// Resolves against the real English locale, so these assertions fail if the
// screen loses a translation rather than quietly falling back to the key.
vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

afterEach(cleanup);

function renderSection(overrides = {}) {
  const props = {
    activeProject: { id: "p1", name: "Шуртан" },
    report: null,
    checking: false,
    onCheck: vi.fn(),
    ...overrides,
  };

  const { container } = render(<ProjectIntegritySection {...props} />);
  return { ...props, container };
}

/** Число в строке отчёта стоит рядом с подписью, в своём `strong`. */
function countFor(label) {
  const row = screen.getByText(label).parentElement;
  return row.querySelector("strong").textContent;
}

describe("ProjectIntegritySection", () => {
  it("renders nothing while no project is open", () => {
    const { container } = renderSection({ activeProject: null });

    expect(container.firstChild).toBeNull();
  });

  it("offers the check and reports nothing before it has run", () => {
    const { onCheck } = renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Issues found/)).not.toBeInTheDocument();
  });

  /*
   * Проверка идёт по всем записям проекта и на большом реестре не мгновенна.
   * Второй запуск поверх первого — лишняя работа, поэтому кнопка на это время
   * заперта и говорит, что занята.
   */
  it("locks the button while the check is running", () => {
    renderSection({ checking: true });

    const button = screen.getByRole("button", { name: "Checking..." });
    expect(button).toBeDisabled();
  });

  it("states the record count when the project came out clean", () => {
    renderSection({ report: { ok: true, total: 132 } });

    expect(screen.getByText("No issues found (132 records)")).toBeVisible();
    expect(screen.queryByText("No photo")).not.toBeInTheDocument();
  });

  it("breaks the issues down by kind", () => {
    renderSection({
      report: {
        ok: false,
        issues: 4,
        missingPhoto: ["4727", "4728"],
        brokenPhoto: ["4729"],
        missingCoords: [],
        duplicateLeakIds: ["4730"],
      },
    });

    expect(screen.getByText("Issues found: 4")).toBeVisible();
    expect(countFor("No photo")).toBe("2");
    expect(countFor("Broken photos")).toBe("1");
    expect(countFor("No coordinates")).toBe("0");
    expect(countFor("Duplicate leak_id")).toBe("1");
  });

  /*
   * Поля отчёта, появившиеся позже остальных, у старого отчёта отсутствуют.
   * Строка о них всё равно рисуется — с нулём, а не падением на `length`.
   */
  it("survives a report written before the newer checks existed", () => {
    renderSection({
      report: {
        ok: false,
        issues: 1,
        missingPhoto: ["4727"],
        brokenPhoto: [],
        missingCoords: [],
        duplicateLeakIds: [],
      },
    });

    expect(countFor("No repair photo")).toBe("0");
    expect(countFor("No after photo")).toBe("0");
    expect(countFor("No monitoring photo")).toBe("0");
    expect(countFor("Linked component card is gone")).toBe("0");
  });

  /*
   * Бирок в строке может быть сколько угодно, а место в разделе одно: список
   * обрезается, чтобы одна многочисленная беда не вытеснила с экрана
   * остальные.
   */
  it("lists at most five tags per issue", () => {
    renderSection({
      report: {
        ok: false,
        issues: 7,
        missingPhoto: ["1", "2", "3", "4", "5", "6", "7"],
        brokenPhoto: [],
        missingCoords: [],
        duplicateLeakIds: [],
      },
    });

    expect(countFor("No photo")).toBe("7");
    expect(screen.getByText("1, 2, 3, 4, 5")).toBeVisible();
  });

  it("leaves out the tag list for an issue nothing tripped", () => {
    const { container } = renderSection({
      report: {
        ok: false,
        issues: 1,
        missingPhoto: ["4727"],
        brokenPhoto: [],
        missingCoords: [],
        duplicateLeakIds: [],
      },
    });

    // Подпись и число есть у всех восьми строк, список бирок — только у той,
    // где есть что перечислять.
    expect(container.querySelectorAll("small")).toHaveLength(1);
  });
});
