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

const inspection = (photo, result) => ({
  id: "leak-1-1789479490260",
  type: "inspection",
  date: "2026-09-15T13:38:10.260Z",
  result,
  photo,
});

describe("LeakRepairSection", () => {
  it.each([
    ["open", false],
    ["in_progress", false],
    ["resolved", true],
  ])("shows the after photo only for %s leaks", (status, showsAfter) => {
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
    expect(screen.getByAltText("Repair")).toBeTruthy();
    expect(Boolean(screen.queryByAltText("After"))).toBe(showsAfter);
  });

  it("shows the round photo when a leak in repair has no photos of its own", () => {
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

    expect(screen.getByAltText("Round").getAttribute("src")).toBe("round.jpg");
    expect(screen.queryByText("No photos")).toBeNull();
  });

  it("does not repeat a round photo already shown as the after photo", () => {
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
});
