import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LeakRepairSection from "./LeakRepairSection";

vi.mock("@/hooks/usePhotoSrc", () => ({
  usePhotoSrc: (path) => path,
}));

const localeTexts = {
  photo: {
    before: "Before",
    repair: "Repair",
    after: "After",
    monitoring: "Round",
    noPhoto: "No photo",
  },
  empty: { photo: "No photos" },
};

const inspection = (photo, result, date = "2026-09-15T13:38:10.260Z") => ({
  id: `inspection-${result}`,
  type: "inspection",
  date,
  result,
  photo,
});

describe("LeakRepairSection", () => {
  it.each([
    ["open", false, false],
    ["in_progress", true, false],
    ["resolved", true, true],
  ])(
    "shows repair and after photos by status for %s leaks",
    (status, showsRepair, showsAfter) => {
      render(
        <LeakRepairSection
          data={{
            status,
            photo: "before.jpg",
            photo_repair: "repair.jpg",
            photo_after: "after.jpg",
          }}
          localeTexts={localeTexts}
        />,
      );

      expect(screen.getByAltText("Before")).toBeTruthy();
      expect(Boolean(screen.queryByAltText("Repair"))).toBe(showsRepair);
      expect(Boolean(screen.queryByAltText("After"))).toBe(showsAfter);
    },
  );

  it("puts the round photo into the repair slot of a leak the round sent to repair", () => {
    // Так выглядят утечки из архива «LDAR UNG Phase I»: обход отправил их на
    // перепроверку, и единственный снимок лежит в событии осмотра.
    render(
      <LeakRepairSection
        data={{
          status: "in_progress",
          events: [inspection("round.jpg", "needs_recheck")],
        }}
        localeTexts={localeTexts}
      />,
    );

    expect(screen.getByAltText("Repair").getAttribute("src")).toBe("round.jpg");
    expect(screen.queryByAltText("Round")).toBeNull();
    expect(screen.queryByText("No photos")).toBeNull();
  });

  it("puts the resolving round photo into the after slot and keeps it single", () => {
    render(
      <LeakRepairSection
        data={{
          status: "resolved",
          events: [inspection("round.jpg", "resolved")],
        }}
        localeTexts={localeTexts}
      />,
    );

    expect(screen.getByAltText("After").getAttribute("src")).toBe("round.jpg");
    expect(screen.queryByAltText("Round")).toBeNull();
  });

  it("keeps the round photo in its own slot for an open leak", () => {
    render(
      <LeakRepairSection
        data={{
          status: "open",
          events: [inspection("round.jpg", "still_leaking")],
        }}
        localeTexts={localeTexts}
      />,
    );

    expect(screen.getByAltText("Round").getAttribute("src")).toBe("round.jpg");
    expect(screen.queryByAltText("Repair")).toBeNull();
  });
});
