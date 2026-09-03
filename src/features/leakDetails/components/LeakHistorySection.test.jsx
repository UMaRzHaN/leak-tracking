import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LeakHistorySection from "./LeakHistorySection";

vi.mock("react-i18next", async () => {
  const { translate } = await import("@/test/translate");
  return { useTranslation: () => ({ t: translate, i18n: { language: "en" } }) };
});

vi.mock("@/hooks/usePhotoSrc", () => ({ usePhotoSrc: () => null }));
vi.mock("@/features/photos/PhotoViewer/PhotoViewer", () => ({
  default: () => null,
}));

const localeTexts = {
  monitoring: {
    round: "Round",
    inspector: "Inspector",
    materials: "Materials",
    comment: "Comment",
    previousPhoto: "Previous",
    photo: "Photo",
  },
  photo: { monitoring: "Monitoring photo" },
  repairEvents: {
    repair_started: "Repair started",
    repair_done: "Repair finished",
    photo: "Repair photo",
  },
  empty: { monitoring: "No monitoring", history: "No history" },
  actions: { edited: "Edited" },
  statuses: { open: "Open" },
  user: "User",
  priority: "Priority",
};

const props = {
  fields: [],
  localeTexts,
  t: (key, options) => options?.defaultValue ?? key,
  lang: "en",
};

describe("LeakHistorySection", () => {
  it("does not crash when legacy local history contains object values", () => {
    const { container } = render(
      <LeakHistorySection
        {...props}
        activeTab="history"
        data={{
          id: "x",
          history: [
            {
              action: "edited",
              date: "2026-08-02T10:00:00.000Z",
              user: { name: "Inspector" },
              to: "open",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Edited")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("[object Object]");
  });

  it("does not render object monitoring values as React children", () => {
    const { container } = render(
      <LeakHistorySection
        {...props}
        activeTab="monitoring"
        data={{
          id: "x",
          monitoringRecords: [
            {
              id: "m1",
              date: "2026-08-02T10:00:00.000Z",
              result: "resolved",
              monitoredBy: { name: "Inspector" },
              comment: { text: "Done" },
              materials_equipment: { name: "Seal" },
              materialsChanged: true,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Inspector")).toBeInTheDocument();
    expect(screen.getByText("Comment")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("[object Object]");
  });

  it("shows repairs and rounds in one feed, newest first", () => {
    render(
      <LeakHistorySection
        {...props}
        activeTab="monitoring"
        data={{
          id: "x",
          monitoringRecords: [
            {
              id: "round-1",
              date: "2026-08-02T10:00:00.000Z",
              result: "still_leaking",
            },
          ],
          events: [
            {
              id: "e1",
              type: "repair_started",
              date: "2026-08-01T10:00:00.000Z",
              user: "Operator",
            },
            {
              // Тот же номер, что у записи обхода: приложение пишет обход в
              // оба списка одной записью, и показать её надо один раз.
              id: "round-1",
              type: "inspection",
              date: "2026-08-02T10:00:00.000Z",
              result: "still_leaking",
            },
            {
              id: "e3",
              type: "repair_done",
              date: "2026-08-03T10:00:00.000Z",
              user: "Operator",
            },
          ],
        }}
      />,
    );

    const badges = screen
      .getAllByRole("article")
      .map((article) => article.getAttribute("data-event"));
    // Обход и его событие несут один номер и показываются одной карточкой.
    expect(badges).toEqual(["repair_done", null, "repair_started"]);
    expect(screen.getByText("Repair started")).toBeInTheDocument();
    expect(screen.getByText("Repair finished")).toBeInTheDocument();
  });
});
