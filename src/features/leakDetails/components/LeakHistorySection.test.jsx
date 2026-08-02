import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LeakHistorySection from "./LeakHistorySection";

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
    render(
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
    expect(screen.queryByText(/Objects are not valid/)).not.toBeInTheDocument();
  });

  it("does not render object monitoring values as React children", () => {
    render(
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
  });
});
