import { describe, expect, it } from "vitest";
import {
  APP_PAGES,
  FULL_SCREEN_PAGES,
  isFullScreenPage,
  isListPage,
  showsComponentTree,
  LIST_PAGES,
  normalizePage,
} from "@/app/pages";
import { MAP_BASE } from "@/pages/MapPage/mapBase";

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

describe("чьё дерево мест показывает экран", () => {
  it("реестр — всегда железо", () => {
    expect(showsComponentTree("components")).toBe(true);
    expect(showsComponentTree("component")).toBe(true);
  });

  it("карта — по включённой на ней базе", () => {
    // Раньше шапка на карте всегда считала утечки: рядом с «Мессояхское УПГ»
    // стояло их число, а на карте в это время было железо.
    expect(showsComponentTree("map", MAP_BASE.COMPONENTS)).toBe(true);
    expect(showsComponentTree("map", MAP_BASE.LEAKS)).toBe(false);
    expect(showsComponentTree("map")).toBe(false);
  });

  it("на остальных экранах база карты ничего не решает", () => {
    for (const page of ["", "db", "monitoring", "add", "settings"]) {
      expect(showsComponentTree(page, MAP_BASE.COMPONENTS)).toBe(false);
    }
  });
});
