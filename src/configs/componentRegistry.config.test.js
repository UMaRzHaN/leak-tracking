import { describe, expect, it } from "vitest";
import {
  componentRegistryProjectTypes,
  hasComponentRegistry,
} from "./componentRegistry.config";

describe("которые типы проектов ведут реестр компонентов", () => {
  it("отвечает по объявленному блоку, а не по имени типа", () => {
    expect(hasComponentRegistry("upstream")).toBe(true);
    expect(hasComponentRegistry("midstream")).toBe(true);
    expect(hasComponentRegistry("downstream")).toBe(true);
  });

  it("принимает и объект проекта, и голый тип", () => {
    expect(hasComponentRegistry({ type: "upstream" })).toBe(true);
    expect(hasComponentRegistry({ type: "midstream" })).toBe(true);
  });

  it("у незнакомого типа реестра нет", () => {
    expect(hasComponentRegistry("нет такого")).toBe(false);
    expect(hasComponentRegistry(null)).toBe(false);
  });

  it("перечисляет типы, куда можно принять архив инвентаризации", () => {
    // Архив не несёт ни имени проекта, ни его типа. Пока ответ был один,
    // вызывающая сторона подставляла его молча; теперь их три, и выбор
    // приходится показать человеку.
    expect(componentRegistryProjectTypes()).toEqual([
      "upstream",
      "midstream",
      "downstream",
    ]);
  });
});
