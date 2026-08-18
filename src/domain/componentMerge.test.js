import { describe, expect, it } from "vitest";
import {
  findUidConflicts,
  hasUnresolvedConflicts,
  mergeComponentRegistries,
} from "@/domain/componentMerge";

const card = (id, uid, extra = {}) => ({
  id,
  component_uid: uid,
  updatedAt: 1_000,
  ...extra,
});

describe("merging registries", () => {
  it("brings across what the other device walked", () => {
    const result = mergeComponentRegistries(
      [card("a", "1")],
      [card("b", "2"), card("c", "3")],
    );

    expect(result.merged.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(result.added).toBe(2);
  });

  it("recognises one record seen twice by its uuid", () => {
    const result = mergeComponentRegistries([card("a", "1")], [card("a", "1")]);

    expect(result.merged).toHaveLength(1);
    expect(result.added).toBe(0);
  });

  it("takes the newer copy of the same card", () => {
    const result = mergeComponentRegistries(
      [card("a", "1", { manufacturer: "старое", updatedAt: 1_000 })],
      [card("a", "1", { manufacturer: "новое", updatedAt: 2_000 })],
    );

    expect(result.merged[0].manufacturer).toBe("новое");
    expect(result.updated).toBe(1);
  });

  it("keeps the local copy when it is the newer one", () => {
    const result = mergeComponentRegistries(
      [card("a", "1", { manufacturer: "новое", updatedAt: 5_000 })],
      [card("a", "1", { manufacturer: "старое", updatedAt: 1_000 })],
    );

    expect(result.merged[0].manufacturer).toBe("новое");
    expect(result.updated).toBe(0);
  });

  it("takes the whole newer card rather than mixing halves of two", () => {
    // A card is filled in one sitting in front of the equipment; a field-wise
    // merge would describe hardware nobody ever saw.
    const result = mergeComponentRegistries(
      [
        card("a", "1", {
          manufacturer: "Завод",
          body_material: "Сталь 20",
          updatedAt: 1_000,
        }),
      ],
      [card("a", "1", { manufacturer: "Другой", updatedAt: 2_000 })],
    );

    expect(result.merged[0]).toEqual({
      id: "a",
      component_uid: "1",
      manufacturer: "Другой",
      updatedAt: 2_000,
    });
  });

  it("keeps both cards when two devices used the same number", () => {
    // Both walkers started at 1; neither card may be dropped.
    const result = mergeComponentRegistries(
      [card("a", "7", { component_name: "Задвижка" })],
      [card("b", "7", { component_name: "Манометр" })],
    );

    expect(result.merged).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].uid).toBe("7");
    expect(result.conflicts[0].records.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("does not renumber anything by itself", () => {
    const result = mergeComponentRegistries([card("a", "7")], [card("b", "7")]);
    expect(result.merged.map((c) => c.component_uid)).toEqual(["7", "7"]);
  });

  it("reports nothing to resolve when numbers do not collide", () => {
    const result = mergeComponentRegistries([card("a", "1")], [card("b", "2")]);
    expect(result.conflicts).toEqual([]);
  });

  it("survives junk in the incoming list", () => {
    const result = mergeComponentRegistries(
      [card("a", "1")],
      [null, undefined, card("b", "2")],
    );
    expect(result.merged.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("treats a missing change time as the oldest possible", () => {
    const result = mergeComponentRegistries(
      [{ id: "a", component_uid: "1", manufacturer: "есть" }],
      [{ id: "a", component_uid: "1", manufacturer: "тоже", updatedAt: 5 }],
    );
    expect(result.merged[0].manufacturer).toBe("тоже");
  });

  it("merges into an empty registry", () => {
    const result = mergeComponentRegistries([], [card("a", "1")]);
    expect(result.merged).toHaveLength(1);
    expect(result.added).toBe(1);
  });

  it("handles an archive that carried no registry", () => {
    const result = mergeComponentRegistries([card("a", "1")], []);
    expect(result.merged).toHaveLength(1);
    expect(result.added).toBe(0);
  });
});

describe("finding conflicts", () => {
  it("surfaces a collision typed on one device the same as one from elsewhere", () => {
    expect(findUidConflicts([card("a", "4"), card("b", "4")])).toHaveLength(1);
  });

  it("groups every card sharing a number, not just the first pair", () => {
    const conflicts = findUidConflicts([
      card("a", "4"),
      card("b", "4"),
      card("c", "4"),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].records).toHaveLength(3);
  });

  it("ignores cards with no number yet", () => {
    expect(
      findUidConflicts([card("a", ""), card("b", ""), card("c", "1")]),
    ).toEqual([]);
  });

  it("lists conflicts in walking order", () => {
    const conflicts = findUidConflicts([
      card("a", "10"),
      card("b", "10"),
      card("c", "2"),
      card("d", "2"),
    ]);

    expect(conflicts.map((conflict) => conflict.uid)).toEqual(["2", "10"]);
  });

  it("answers whether the registry can be trusted as a report", () => {
    expect(hasUnresolvedConflicts([card("a", "1"), card("b", "2")])).toBe(
      false,
    );
    expect(hasUnresolvedConflicts([card("a", "1"), card("b", "1")])).toBe(true);
  });
});
