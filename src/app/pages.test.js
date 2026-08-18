import { describe, expect, it } from "vitest";
import {
  APP_PAGES,
  FULL_SCREEN_PAGES,
  isFullScreenPage,
  isListPage,
  LIST_PAGES,
  normalizePage,
} from "@/app/pages";

describe("app pages", () => {
  it("keeps every navigable page in one allow-list", () => {
    // Anything outside it is rewritten to home without a word, which reads as a
    // button that does nothing.
    for (const page of [...LIST_PAGES, ...FULL_SCREEN_PAGES]) {
      expect(APP_PAGES.has(page)).toBe(true);
    }
  });

  it("never treats one page as both pinned and full-screen", () => {
    // A pinned shell clips a page that scrolls the document, and a full-screen
    // page hides the navigation a list page needs.
    for (const page of LIST_PAGES) {
      expect(FULL_SCREEN_PAGES.has(page)).toBe(false);
    }
  });

  it("sends an unknown page home", () => {
    expect(normalizePage("nonsense")).toBe("");
    expect(normalizePage(undefined)).toBe("");
    expect(normalizePage("components")).toBe("components");
  });

  it("separates the registry list from the card filled in front of equipment", () => {
    expect(isListPage("components")).toBe(true);
    expect(isFullScreenPage("components")).toBe(false);

    expect(isFullScreenPage("component")).toBe(true);
    expect(isListPage("component")).toBe(false);
  });
});
