import { beforeEach, describe, expect, it } from "vitest";
import {
  HIDDEN_FIELD_SCOPES,
  hiddenFieldsStorageKey,
  readHiddenFields,
} from "@/app/project/hiddenFieldsStorage";

/**
 * Два списка скрытых полей, а не один.
 *
 * Имена полей у утечки и у карточки компонента пересекаются — `location`,
 * `object`, `component` есть и там и там. Общий список скрыл бы поле разом на
 * обоих экранах, чего человек, убирая столбец из реестра, не просил.
 */
describe("скрытые поля проекта", () => {
  beforeEach(() => localStorage.clear());

  it("у утечек и у реестра разные ключи хранения", () => {
    expect(hiddenFieldsStorageKey("p1", HIDDEN_FIELD_SCOPES.LEAKS)).not.toBe(
      hiddenFieldsStorageKey("p1", HIDDEN_FIELD_SCOPES.COMPONENTS),
    );
  });

  it("скрытое в реестре не скрывается у утечек", () => {
    localStorage.setItem(
      hiddenFieldsStorageKey("p1", HIDDEN_FIELD_SCOPES.COMPONENTS),
      JSON.stringify(["object"]),
    );

    expect(readHiddenFields("p1", HIDDEN_FIELD_SCOPES.COMPONENTS)).toEqual(
      new Set(["object"]),
    );
    expect(readHiddenFields("p1", HIDDEN_FIELD_SCOPES.LEAKS)).toEqual(
      new Set(),
    );
  });

  it("списки не делятся между проектами", () => {
    localStorage.setItem(
      hiddenFieldsStorageKey("p1", HIDDEN_FIELD_SCOPES.COMPONENTS),
      JSON.stringify(["object"]),
    );

    expect(readHiddenFields("p2", HIDDEN_FIELD_SCOPES.COMPONENTS)).toEqual(
      new Set(),
    );
  });

  it("без проекта и на битой записи отвечает пустым, а не падает", () => {
    expect(hiddenFieldsStorageKey(null)).toBeNull();
    expect(readHiddenFields(null)).toEqual(new Set());

    localStorage.setItem(
      hiddenFieldsStorageKey("p1", HIDDEN_FIELD_SCOPES.LEAKS),
      "не json",
    );
    expect(readHiddenFields("p1")).toEqual(new Set());
  });

  it("по умолчанию спрашивают про утечки", () => {
    localStorage.setItem(
      hiddenFieldsStorageKey("p1", HIDDEN_FIELD_SCOPES.LEAKS),
      JSON.stringify(["note"]),
    );

    expect(readHiddenFields("p1")).toEqual(new Set(["note"]));
  });
});
