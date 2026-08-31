import { describe, expect, it } from "vitest";
import {
  hideFieldsInExcel,
  hideFieldsInSteps,
  withoutProtected,
} from "@/configs/shared/hideFields";
import { PROTECTED_FIELD_KEYS } from "@/configs/shared/protectedFields";

/**
 * Как прячутся поля — одно правило на утечку и на карточку компонента.
 */
const steps = [
  { title: "Первый", fields: [{ key: "object" }, { key: "component" }] },
  { title: "Второй", fields: [{ key: "note" }] },
];

const excel = {
  sheet: "Компоненты",
  headers: ["Объект", "Компонент", "Примечание"],
  keysOrder: ["object", "component", "note"],
};

describe("скрытие полей", () => {
  it("убирает поле из шагов формы", () => {
    const [first] = hideFieldsInSteps(steps, new Set(["component"]));

    expect(first.fields.map((f) => f.key)).toEqual(["object"]);
  });

  it("шаг, оставшийся без полей, уходит целиком", () => {
    // Пустая страница мастера выглядит поломкой, а не настройкой.
    const result = hideFieldsInSteps(steps, new Set(["note"]));

    expect(result.map((step) => step.title)).toEqual(["Первый"]);
  });

  it("режет заголовки и ключи парами", () => {
    // Их два списка одной длины: фильтровать порознь — однажды сдвинуть
    // подписи относительно данных.
    const result = hideFieldsInExcel(excel, new Set(["component"]));

    expect(result.keysOrder).toEqual(["object", "note"]);
    expect(result.headers).toEqual(["Объект", "Примечание"]);
  });

  it("остальное в объявлении выгрузки не трогает", () => {
    expect(hideFieldsInExcel(excel, new Set(["note"])).sheet).toBe(
      "Компоненты",
    );
  });

  it("пустой набор возвращает исходное без копирования", () => {
    expect(hideFieldsInSteps(steps, new Set())).toBe(steps);
    expect(hideFieldsInExcel(excel, new Set())).toBe(excel);
  });

  it("защищённые поля не прячутся никогда", () => {
    // На них держится обработка данных, а не показ.
    const protectedKey = [...PROTECTED_FIELD_KEYS][0];

    expect(withoutProtected(new Set([protectedKey]))).toEqual(new Set());
    expect(withoutProtected(new Set([protectedKey, "note"]))).toEqual(
      new Set(["note"]),
    );
  });
});
