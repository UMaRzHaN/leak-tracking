import { describe, expect, it } from "vitest";
import { localizeComponentSteps } from "./localizeComponentSteps";
import { translation as ru } from "@/locales/ru";
import { translation as en } from "@/locales/en";

/**
 * Подписи полей карточки компонента.
 *
 * Поля локации у карточки те же, что у утечки, и тексты к ним живут в
 * `addLeak.fields`. Здесь проверяется, что карточка их оттуда берёт, а не
 * держит свою копию: копия разошлась бы с оригиналом при первой же правке.
 */
const translator = (dictionary) => (key, options) => {
  const value = key
    .split(".")
    .reduce((node, part) => (node == null ? node : node[part]), dictionary);
  return typeof value === "string" ? value : (options?.defaultValue ?? key);
};

const stepsWith = (...keys) => [{ fields: keys.map((key) => ({ key })) }];

const localize = (dictionary, ...keys) =>
  localizeComponentSteps(stepsWith(...keys), translator(dictionary))[0].fields;

describe("подписи полей карточки компонента", () => {
  it("берёт подсказку и пример у формы утечки, когда своих нет", () => {
    // До этого на «транспортировке» и «сбыте» три верхних поля стояли пустыми:
    // подписи были только у полей добычи.
    const [locality, address, station] = localize(
      ru,
      "locality",
      "address",
      "station",
    );

    expect(locality.hint).toBe(ru.addLeak.fields.locality.hint);
    expect(locality.placeholder).toBe(ru.addLeak.fields.locality.placeholder);
    expect(address.hint).toBe(ru.addLeak.fields.address.hint);
    expect(station.placeholder).toBe(ru.addLeak.fields.station.placeholder);
  });

  it("своя подсказка перебивает подсказку утечки", () => {
    // У утечки район — тот, «в котором зафиксирована утечка»; карточка
    // описывает железо, а не событие.
    const [district] = localize(ru, "district");

    expect(district.hint).toBe(ru.components.fields.district.hint);
    expect(district.hint).not.toBe(ru.addLeak.fields.district.hint);
    expect(district.hint).not.toContain("утечка");
  });

  it("то же по-английски", () => {
    const [locality, district] = localize(en, "locality", "district");

    expect(locality.hint).toBe(en.addLeak.fields.locality.hint);
    expect(district.hint).toBe(en.components.fields.district.hint);
  });

  it("поле, которого нет ни там ни там, остаётся без подсказки", () => {
    // Пустая строка, а не ключ: иначе на экране появился бы
    // `components.fields.unknown.hint`.
    const [unknown] = localize(ru, "unknown_field");

    expect(unknown.hint).toBe("");
    expect(unknown.placeholder).toBe("");
  });

  it("ни одно поле локации не остаётся без примера ни в одном языке", () => {
    const LOCATION_KEYS = [
      "subdivision",
      "deposit",
      "location",
      "field",
      "station",
      "locality",
      "district",
      "address",
    ];

    for (const [name, dictionary] of [
      ["ru", ru],
      ["en", en],
    ]) {
      for (const field of localize(dictionary, ...LOCATION_KEYS)) {
        expect(`${name}:${field.key}:${field.hint}`).not.toMatch(/:$/);
        expect(`${name}:${field.key}:${field.placeholder}`).not.toMatch(/:$/);
      }
    }
  });
});
