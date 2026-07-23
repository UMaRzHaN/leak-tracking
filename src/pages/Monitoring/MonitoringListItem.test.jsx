import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/leakList/LeakCardCompact/LeakCardCompact", () => ({
  default: ({ leak }) => <div>{leak.leak_id}</div>,
}));

import MonitoringListItem from "./MonitoringListItem";

const defaultProps = {
  lang: "en",
  texts: {
    lastCheck: "Last check",
    never: "Never checked",
    check: "Check",
  },
  roundId: "round-2",
  roundNumber: 2,
  hasActiveRound: true,
  onOpenDetails: vi.fn(),
  onPickStatus: vi.fn(),
  onMonitor: vi.fn(),
};

describe("MonitoringListItem", () => {
  it("shows the name from the latest monitoring record", () => {
    render(
      <MonitoringListItem
        {...defaultProps}
        leak={{
          id: "leak-1",
          leak_id: "TAG-1",
          detectedBy: "Original inspector",
          monitoringRecords: [
            {
              date: "2026-07-20T08:00:00.000Z",
              monitoredBy: "First checker",
              result: "still_leaking",
            },
            {
              date: "2026-07-21T08:00:00.000Z",
              monitoredBy: "Latest checker",
              result: "resolved",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Latest checker")).toBeTruthy();
    expect(screen.queryByText("Original inspector")).toBeNull();
    expect(screen.queryByText("First checker")).toBeNull();
  });

  it("shows who detected the leak when it has not been monitored yet", () => {
    render(
      <MonitoringListItem
        {...defaultProps}
        leak={{
          id: "leak-2",
          leak_id: "TAG-2",
          detectedBy: "Original inspector",
          monitoringRecords: [],
        }}
      />,
    );

    expect(screen.getByText("Original inspector")).toBeTruthy();
  });
});
