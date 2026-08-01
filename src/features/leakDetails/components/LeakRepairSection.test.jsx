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
    noPhoto: "No photo",
  },
  empty: { photo: "No photos" },
};

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
});
