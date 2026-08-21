import { describe, expect, it } from "vitest";
import { mergeSheetEditsIntoCards } from "./inventorySheetMerge";

const card = (overrides = {}) => ({
  id: "c-32",
  component_uid: "32",
  subdivision: "Бузахур",
  object: "Задвижка",
  medium: "метан",
  photo: "data://LeakReports/p/photos/photo_c-32_h_abc.jpg",
  history: [{ at: 1, user: "Инспектор" }],
  updatedAt: 1000,
  ...overrides,
});

describe("mergeSheetEditsIntoCards", () => {
  it("applies an edited cell over the snapshot", () => {
    const result = mergeSheetEditsIntoCards(
      [card()],
      [{ component_uid: "32", object: "Кран", medium: "метан" }],
      { now: 5000 },
    );

    expect(result.cards[0]).toMatchObject({
      object: "Кран",
      medium: "метан",
      updatedAt: 5000,
    });
    expect(result).toMatchObject({ edited: 1, added: 0, missing: 0 });
  });

  it("leaves an untouched workbook completely alone", () => {
    const snapshot = card();
    const result = mergeSheetEditsIntoCards(
      [snapshot],
      [{ component_uid: "32", subdivision: "Бузахур", object: "Задвижка" }],
      { now: 5000 },
    );

    expect(result.cards[0]).toEqual(snapshot);
    expect(result.edited).toBe(0);
  });

  it("keeps the photo and the history the sheet cannot carry", () => {
    const result = mergeSheetEditsIntoCards(
      [card()],
      [
        {
          component_uid: "32",
          object: "Кран",
          photo: "Photos/32.jpg",
          history: "что-то из ячейки",
        },
      ],
      { now: 5000 },
    );

    expect(result.cards[0].photo).toBe(
      "data://LeakReports/p/photos/photo_c-32_h_abc.jpg",
    );
    expect(result.cards[0].history).toEqual([{ at: 1, user: "Инспектор" }]);
  });

  it("treats an empty cell as silence, not as an erasure", () => {
    const result = mergeSheetEditsIntoCards(
      [card()],
      [{ component_uid: "32", object: "   ", medium: null }],
      { now: 5000 },
    );

    expect(result.cards[0]).toMatchObject({
      object: "Задвижка",
      medium: "метан",
      updatedAt: 1000,
    });
    expect(result.edited).toBe(0);
  });

  it("adds a row written into the sheet by hand", () => {
    const result = mergeSheetEditsIntoCards(
      [card()],
      [
        { component_uid: "32", object: "Задвижка" },
        { component_uid: "33", object: "Фланец", id: "c-33" },
      ],
      { now: 5000 },
    );

    expect(result.cards).toHaveLength(2);
    expect(result.cards[1]).toMatchObject({ component_uid: "33" });
    expect(result).toMatchObject({ added: 1, edited: 0 });
  });

  it("keeps a card the sheet no longer lists", () => {
    const result = mergeSheetEditsIntoCards(
      [card(), card({ id: "c-33", component_uid: "33" })],
      [{ component_uid: "32", object: "Задвижка" }],
    );

    expect(result.cards).toHaveLength(2);
    expect(result.missing).toBe(1);
  });

  it("does not read a differently formatted date as an edit", () => {
    const result = mergeSheetEditsIntoCards(
      [card({ installed_at: "2026-05-12T00:00:00.000Z" })],
      [{ component_uid: "32", installed_at: "2026-05-12" }],
      { now: 5000 },
    );

    expect(result.edited).toBe(0);
    expect(result.cards[0].updatedAt).toBe(1000);
  });

  it("ignores a row with no identity at all", () => {
    const result = mergeSheetEditsIntoCards(
      [card()],
      [{ object: "Кран" }, { component_uid: "  ", object: "Фланец" }],
    );

    expect(result.cards).toHaveLength(1);
    expect(result).toMatchObject({ added: 0, edited: 0 });
  });

  it("returns the snapshot untouched when there is no visible sheet", () => {
    const snapshot = [card()];
    expect(mergeSheetEditsIntoCards(snapshot, [])).toMatchObject({
      cards: snapshot,
      edited: 0,
      added: 0,
      missing: 1,
    });
  });
});
