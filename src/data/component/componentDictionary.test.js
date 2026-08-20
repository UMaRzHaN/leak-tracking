import { describe, expect, it } from "vitest";
import {
  component_names,
  component_statuses,
  component_types,
  equipment_types,
} from "./componentDictionary";
import { components as leakComponents } from "@/data/leak/fieldDictionary";
import { translateAutocompleteOption } from "@/features/search/Autocomplete/optionTranslations";

/**
 * Наименования оборудования должны совпадать у утечки и у карточки.
 *
 * Поле `component` у них общее — карточка компонента копируется в утечку
 * напрямую, без таблицы соответствий. Пока списки были независимы, одно и то
 * же железо называлось двумя способами («Кран шаровой» против «Кран Шаровой»),
 * и голосовой ввод сводил сказанное то к одной строке, то к другой. Эти
 * проверки — про то, чтобы расхождение не вернулось незамеченным.
 */
describe("наименования компонентов и словарь утечек", () => {
  it("предлагает всё, что знает словарь утечек", () => {
    const offered = new Set(component_names);
    const missing = leakComponents.filter((name) => !offered.has(name));

    expect(missing).toEqual([]);
  });

  it("не повторяет наименования", () => {
    const seen = new Map();
    for (const name of component_names) {
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }

    expect([...seen].filter(([, count]) => count > 1)).toEqual([]);
  });

  // Ровно та поломка, что была: «Кран шаровой» и «Кран Шаровой» — одно железо,
  // две строки, и автодополнение с голосом разводили их по разным значениям.
  it("не называет одно железо двумя написаниями", () => {
    const key = (name) =>
      name.toLowerCase().replaceAll("ё", "е").split(/\s+/).sort().join(" ");

    const byKey = new Map();
    for (const name of component_names) {
      const group = byKey.get(key(name)) ?? [];
      group.push(name);
      byKey.set(key(name), group);
    }

    expect([...byKey.values()].filter((group) => group.length > 1)).toEqual([]);
  });

  // Английская колонка книги заказчика заполняется из общего переводчика
  // подсказок. Наименование без перевода оставит её пустой.
  it("переводит каждое наименование на английский", () => {
    const untranslated = component_names.filter(
      (name) => translateAutocompleteOption(name, "en") === name,
    );

    expect(untranslated).toEqual([]);
  });

  // Эти три описывают само железо, а не утечку: у утечки таких полей нет, и
  // выводить их неоткуда.
  it("держит собственные словари железа непустыми", () => {
    expect(component_types.length).toBeGreaterThan(0);
    expect(equipment_types.length).toBeGreaterThan(0);
    expect(component_statuses).toContain("В работе");
  });
});
