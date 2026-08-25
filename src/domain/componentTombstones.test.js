import { describe, expect, it } from "vitest";
import {
  MAX_COMPONENT_TOMBSTONES,
  compactComponentTombstones,
  componentChangedAt,
  isComponentTombstone,
  liveComponents,
  tombstoneFor,
  withComponentRemoved,
} from "./componentTombstones";

const card = (id, uid, extra = {}) => ({
  id,
  component_uid: uid,
  updatedAt: 1_000,
  photo: "idb://photo_1",
  ...extra,
});

describe("удалённая карточка компонента", () => {
  it("оставляет номер, но не тащит за собой снимок", () => {
    // Фотография удалённой карточки должна стать сиротой и быть убрана, а не
    // держаться вечно ради записи о том, чего нет.
    const grave = tombstoneFor(card("a", "7"), 5_000);

    expect(grave).toMatchObject({
      id: "a",
      component_uid: "7",
      deleted: true,
      deletedAt: 5_000,
    });
    expect(grave.photo).toBeUndefined();
    expect(isComponentTombstone(grave)).toBe(true);
  });

  it("заменяет карточку на месте, а не выкидывает её из списка", () => {
    const list = [card("a", "1"), card("b", "2"), card("c", "3")];
    const next = withComponentRemoved(list, "b", 5_000);

    expect(next.map((record) => record.id)).toEqual(["a", "b", "c"]);
    expect(isComponentTombstone(next[1])).toBe(true);
    expect(liveComponents(next).map((record) => record.id)).toEqual(["a", "c"]);
  });

  it("удаление удалённого ничего не меняет", () => {
    const once = withComponentRemoved([card("a", "1")], "a", 5_000);
    const twice = withComponentRemoved(once, "a", 9_000);

    expect(twice[0].deletedAt).toBe(5_000);
  });

  it("сравнивает карточку и надгробие одним числом", () => {
    // «Удалили или правили» решается тем, что случилось позже.
    expect(componentChangedAt(card("a", "1", { updatedAt: 7 }))).toBe(7);
    expect(componentChangedAt(tombstoneFor(card("a", "1"), 9))).toBe(9);
    expect(componentChangedAt({ id: "a" })).toBe(0);
  });

  it("забывает самые старые надгробия и не трогает карточки", () => {
    const limit = 3;
    const graves = Array.from({ length: 5 }, (_, index) =>
      tombstoneFor(card(`g${index}`, String(index)), 1_000 + index),
    );
    const compacted = compactComponentTombstones(
      [card("live", "99"), ...graves],
      limit,
    );

    expect(compacted.map((record) => record.id)).toEqual([
      "live",
      "g2",
      "g3",
      "g4",
    ]);
  });

  it("ниже предела ничего не трогает вовсе", () => {
    const list = [card("a", "1"), tombstoneFor(card("b", "2"), 5_000)];
    expect(compactComponentTombstones(list)).toBe(list);
    expect(MAX_COMPONENT_TOMBSTONES).toBeGreaterThan(1_000);
  });
});
