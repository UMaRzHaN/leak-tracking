import { describe, expect, it } from "vitest";
import {
  isLiveSchema,
  liveSchemas,
  mergeSchemaLists,
  schemaIdentity,
  tombstoneForSchema,
  withSchemaRemoved,
} from "@/domain/schemaTombstones";

const MONDAY = 1_772_000_000_000;
const WEDNESDAY = 1_772_200_000_000;

const drawing = (extra = {}) => ({
  id: "s1",
  name: "узел.pdf",
  size: 3,
  type: "application/pdf",
  addedAt: new Date(MONDAY).toISOString(),
  ...extra,
});

describe("опознание схемы между устройствами", () => {
  it("по имени и размеру, а не по идентификатору", () => {
    // `id` выдаётся на устройстве: у одного и того же чертежа на двух
    // телефонах он разный.
    expect(schemaIdentity(drawing({ id: "другой" }))).toBe(
      schemaIdentity(drawing()),
    );
    expect(schemaIdentity(drawing({ size: 4 }))).not.toBe(
      schemaIdentity(drawing()),
    );
  });

  it("схема без имени не опознаётся вовсе", () => {
    expect(schemaIdentity({ size: 3 })).toBeNull();
  });
});

describe("удаление схемы", () => {
  it("оставляет надгробие на месте записи", () => {
    const [record] = withSchemaRemoved([drawing()], "s1", WEDNESDAY);

    expect(record).toMatchObject({
      name: "узел.pdf",
      size: 3,
      deleted: true,
      deletedAt: WEDNESDAY,
    });
    expect(isLiveSchema(record)).toBe(false);
  });

  it("надгробие не описывает того, чего больше нет", () => {
    const grave = tombstoneForSchema(
      drawing({ location: "УППГ-1" }),
      WEDNESDAY,
    );

    expect(grave.type).toBeUndefined();
    expect(grave.location).toBeUndefined();
  });

  it("чужую запись не трогает", () => {
    const list = [drawing(), drawing({ id: "s2", name: "другая.pdf" })];

    expect(liveSchemas(withSchemaRemoved(list, "s1")).map((s) => s.id)).toEqual(
      ["s2"],
    );
  });
});

describe("сведение списков", () => {
  it("удаление в среду уносит чертёж, добавленный в понедельник", () => {
    const merged = mergeSchemaLists(
      [drawing()],
      [tombstoneForSchema(drawing(), WEDNESDAY)],
    );

    expect(liveSchemas(merged)).toEqual([]);
  });

  it("добавление после удаления возвращает чертёж", () => {
    const merged = mergeSchemaLists(
      [tombstoneForSchema(drawing(), MONDAY)],
      [drawing({ addedAt: new Date(WEDNESDAY).toISOString() })],
    );

    expect(liveSchemas(merged)).toHaveLength(1);
  });

  it("на равенстве побеждает удаление", () => {
    // Человек, чьё решение мы не можем упорядочить, скорее переживёт лишний
    // раз добавленный чертёж, чем тот, что он удалил и который вернулся.
    const merged = mergeSchemaLists(
      [drawing()],
      [tombstoneForSchema(drawing(), MONDAY)],
    );

    expect(liveSchemas(merged)).toEqual([]);
  });

  it("порядок сторон на итог не влияет", () => {
    const local = [drawing()];
    const incoming = [tombstoneForSchema(drawing(), WEDNESDAY)];

    expect(mergeSchemaLists(local, incoming)).toEqual(
      mergeSchemaLists(incoming, local),
    );
  });

  it("разные чертежи складываются, а не спорят", () => {
    const merged = mergeSchemaLists(
      [drawing()],
      [drawing({ id: "s2", name: "другая.pdf", size: 9 })],
    );

    expect(
      liveSchemas(merged)
        .map((s) => s.name)
        .sort(),
    ).toEqual(["другая.pdf", "узел.pdf"]);
  });

  it("повторное сведение ничего не меняет", () => {
    const once = mergeSchemaLists(
      [drawing()],
      [tombstoneForSchema(drawing(), WEDNESDAY)],
    );

    expect(mergeSchemaLists(once, once)).toEqual(once);
  });

  it("запись без имени в список не попадает", () => {
    expect(mergeSchemaLists([{ id: "s1", size: 3 }], [])).toEqual([]);
  });
});
