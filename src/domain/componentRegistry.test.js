import { describe, expect, it } from "vitest";
import {
  compareComponentsByUid,
  findComponentUidConflicts,
  isValidComponentUid,
  missingRequiredFields,
  migrateComponentShape,
  normalizeComponent,
  parseComponentUid,
} from "@/domain/componentRegistry";

describe("component uid parsing", () => {
  it("accepts a plain run of digits", () => {
    expect(isValidComponentUid("14")).toBe(true);
    expect(isValidComponentUid(" 14 ")).toBe(true);
    expect(parseComponentUid("014")).toBe(14);
  });

  it("rejects anything that is not digits", () => {
    for (const value of ["ЗД32", "12a", "1.5", "-3", "", null, undefined]) {
      expect(isValidComponentUid(value)).toBe(false);
      expect(parseComponentUid(value)).toBeNull();
    }
  });

  it("refuses a number too large to compare safely", () => {
    expect(parseComponentUid("9".repeat(20))).toBeNull();
  });
});

describe("uid conflicts", () => {
  const registry = [
    { id: "a", component_uid: "7" },
    { id: "b", component_uid: "7" },
    { id: "c", component_uid: "8" },
  ];

  it("finds the other records carrying the same number", () => {
    expect(findComponentUidConflicts(registry, "7").map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("does not report a record against itself while editing", () => {
    expect(
      findComponentUidConflicts(registry, "7", "a").map((c) => c.id),
    ).toEqual(["b"]);
  });

  it("reports nothing for a blank number", () => {
    expect(findComponentUidConflicts(registry, "")).toEqual([]);
    expect(findComponentUidConflicts(registry, null)).toEqual([]);
  });

  it("compares trimmed values so a stray space is still a duplicate", () => {
    expect(findComponentUidConflicts(registry, " 8 ")).toHaveLength(1);
  });
});

describe("sorting", () => {
  it("orders numerically, not as text", () => {
    const sorted = [
      { component_uid: "10" },
      { component_uid: "9" },
      { component_uid: "1" },
    ].sort(compareComponentsByUid);
    expect(sorted.map((c) => c.component_uid)).toEqual(["1", "9", "10"]);
  });

  it("pushes unparsable numbers to the end instead of dropping them", () => {
    const sorted = [{ component_uid: "ЗД32" }, { component_uid: "2" }].sort(
      compareComponentsByUid,
    );
    expect(sorted.map((c) => c.component_uid)).toEqual(["2", "ЗД32"]);
  });
});

describe("normalization", () => {
  it("assigns a uuid that is not the component number", () => {
    const normalized = normalizeComponent({ component_uid: "42" });
    expect(normalized.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(normalized.id).not.toBe("42");
  });

  it("keeps an existing id so editing does not fork the record", () => {
    const normalized = normalizeComponent({ id: "kept", component_uid: "1" });
    expect(normalized.id).toBe("kept");
  });

  it("leaves an unreadable plate empty rather than failing", () => {
    const normalized = normalizeComponent({
      component_uid: "5",
      component: "Задвижка",
    });
    expect(normalized.manufacturer).toBeUndefined();
    expect(normalized.component).toBe("Задвижка");
  });

  it("coerces declared numeric fields and blanks the unparsable ones", () => {
    const normalized = normalizeComponent(
      { component_uid: "5", diameter: "426", working_pressure: "" },
      { numericKeys: ["diameter", "working_pressure", "component_uid"] },
    );
    expect(normalized.diameter).toBe(426);
    expect(normalized.working_pressure).toBeNull();
    // The identity number stays a string: it is a label, not a quantity.
    expect(normalized.component_uid).toBe("5");
  });

  it("normalizes coordinates even when they are not declared numeric", () => {
    const normalized = normalizeComponent({
      component_uid: "1",
      lat: "66.146639",
      lng: "не снято",
    });
    expect(normalized.lat).toBeCloseTo(66.146639);
    expect(normalized.lng).toBeNull();
  });

  it("derives the inspection date instead of asking for one", () => {
    const normalized = normalizeComponent(
      { component_uid: "1" },
      { now: 1_700_000_000_000 },
    );
    expect(normalized.inspected_at).toBe(normalized.date);
  });

  it("does not move the inspection date when the card is edited later", () => {
    // Correcting a typo months on must not claim the equipment was looked at
    // again that day.
    const first = normalizeComponent(
      { component_uid: "1" },
      { now: 1_700_000_000_000 },
    );
    const edited = normalizeComponent(
      { ...first, manufacturer: "Завод" },
      { now: 1_800_000_000_000 },
    );

    expect(edited.inspected_at).toBe(first.inspected_at);
    expect(edited.updatedAt).toBe(1_800_000_000_000);
  });

  it("keeps an inspection date that arrived from another device", () => {
    const normalized = normalizeComponent({
      component_uid: "1",
      inspected_at: "2026-01-01T00:00:00.000Z",
    });
    expect(normalized.inspected_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("stamps the record with a creation date and a change time", () => {
    const normalized = normalizeComponent(
      { component_uid: "1" },
      { now: 1_700_000_000_000 },
    );
    expect(normalized.date).toBe(new Date(1_700_000_000_000).toISOString());
    expect(normalized.updatedAt).toBe(1_700_000_000_000);
  });
});

/*
 * Карточки, заведённые до слияния полей наименования, несут `component_name` и
 * без приведения показываются как «Без наименования» — данные на месте, но не
 * там, где их ищут.
 */
describe("приведение старых карточек", () => {
  it("переносит наименование в нынешний ключ", () => {
    const migrated = migrateComponentShape({
      id: "a",
      component_uid: "7",
      component_name: "Задвижка",
    });

    expect(migrated.component).toBe("Задвижка");
    expect("component_name" in migrated).toBe(false);
    expect(migrated.component_uid).toBe("7");
  });

  it("не трогает английское наименование — это действующее поле", () => {
    const migrated = migrateComponentShape({
      component_name: "Задвижка",
      component_name_en: "Gate valve",
    });

    expect(migrated.component).toBe("Задвижка");
    expect(migrated.component_name_en).toBe("Gate valve");
  });

  // Оба ключа рядом бывают в архиве, выгруженном во время перехода. Побеждает
  // заполненное нынешнее поле, а старое просто отбрасывается.
  it("оставляет заполненное нынешнее поле, отбрасывая старый ключ", () => {
    const migrated = migrateComponentShape({
      component: "Кран Шаровой",
      component_name: "Задвижка",
    });

    expect(migrated.component).toBe("Кран Шаровой");
    expect("component_name" in migrated).toBe(false);
  });

  it("считает пустое нынешнее поле незаполненным", () => {
    expect(
      migrateComponentShape({ component: "   ", component_name: "Задвижка" })
        .component,
    ).toBe("Задвижка");
  });

  it("возвращает нынешнюю карточку как есть", () => {
    const card = { id: "a", component: "Труба" };
    expect(migrateComponentShape(card)).toBe(card);
  });

  it("переживает мусор вместо карточки", () => {
    expect(migrateComponentShape(null)).toBeNull();
    expect(migrateComponentShape("нет")).toBe("нет");
  });

  it("применяется и при записи", () => {
    const normalized = normalizeComponent({
      component_uid: "7",
      component_name: "Задвижка",
    });

    expect(normalized.component).toBe("Задвижка");
    expect("component_name" in normalized).toBe(false);
  });
});

describe("required fields", () => {
  const required = ["location", "component_uid", "component"];

  it("names what is still missing", () => {
    expect(missingRequiredFields({ component_uid: "4" }, required)).toEqual([
      "location",
      "component",
    ]);
  });

  it("treats whitespace as missing", () => {
    expect(
      missingRequiredFields(
        { location: "  ", component_uid: "4", component: "Труба" },
        required,
      ),
    ).toEqual(["location"]);
  });

  it("returns nothing when the three anchors are filled", () => {
    expect(
      missingRequiredFields(
        {
          location: "Скважина 22",
          component_uid: "4",
          component: "Труба",
        },
        required,
      ),
    ).toEqual([]);
  });
});
