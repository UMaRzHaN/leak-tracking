import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { translateRu } from "@/test/translate";
import LeakSummarySection from "./LeakSummarySection";

const localeTexts = { priority: "Приоритет", empty: { info: "Нет данных" } };

const renderSummary = (data, fields = [{ key: "note" }]) =>
  render(
    <LeakSummarySection
      data={data}
      fields={fields}
      localeTexts={localeTexts}
      t={translateRu}
      lang="ru"
    />,
  );

const valueOf = (label) =>
  screen.getByText(label).parentElement?.querySelector("span:last-child")
    ?.textContent;

describe("LeakSummarySection — даты ремонта и устранения", () => {
  it("показывает дату ремонта со временем у утечки, которую в ремонт отправил осмотр", () => {
    renderSummary({
      status: "in_progress",
      events: [
        {
          id: "i1",
          type: "inspection",
          date: "2026-09-15T13:38:10.260Z",
          result: "needs_recheck",
        },
      ],
    });

    expect(valueOf("Дата ремонта")).toMatch(/^15\.09\.2026.*\d{2}:\d{2}$/);
    expect(screen.queryByText("Дата устранения")).toBeNull();
  });

  it("у устранённой показывает и ремонт, и устранение", () => {
    renderSummary({
      status: "resolved",
      events: [
        {
          id: "r1",
          type: "repair_started",
          date: "2026-09-01T10:00:00.000Z",
        },
        { id: "d1", type: "repair_done", date: "2026-09-02T10:00:00.000Z" },
      ],
    });

    expect(valueOf("Дата ремонта")).toMatch(/^01\.09\.2026.*\d{2}:\d{2}$/);
    expect(valueOf("Дата устранения")).toMatch(/^02\.09\.2026.*\d{2}:\d{2}$/);
  });

  it("у открытой утечки дат ремонта не показывает", () => {
    renderSummary({
      status: "open",
      note: "Текст примечания",
      events: [
        {
          id: "r1",
          type: "repair_started",
          date: "2026-09-01T10:00:00.000Z",
        },
      ],
    });

    expect(screen.queryByText("Дата ремонта")).toBeNull();
    expect(screen.getByText("Текст примечания")).toBeTruthy();
  });

  it("дату без времени показывает днём, а не полуночью", () => {
    renderSummary({
      status: "in_progress",
      history: [
        { action: "status_changed", to: "in_progress", date: "2026-03-01" },
      ],
    });

    expect(valueOf("Дата ремонта")).toBe("01.03.2026");
  });
});
