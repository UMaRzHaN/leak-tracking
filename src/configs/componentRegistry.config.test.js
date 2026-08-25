import { describe, expect, it } from "vitest";
import {
  componentRegistryProjectTypes,
  hasComponentRegistry,
} from "./componentRegistry.config";

describe("которые типы проектов ведут реестр компонентов", () => {
  it("отвечает по объявленному блоку, а не по имени типа", () => {
    expect(hasComponentRegistry("upstream")).toBe(true);
    expect(hasComponentRegistry("midstream")).toBe(false);
    expect(hasComponentRegistry("downstream")).toBe(false);
  });

  it("принимает и объект проекта, и голый тип", () => {
    expect(hasComponentRegistry({ type: "upstream" })).toBe(true);
    expect(hasComponentRegistry({ type: "midstream" })).toBe(false);
  });

  it("у незнакомого типа реестра нет", () => {
    expect(hasComponentRegistry("нет такого")).toBe(false);
    expect(hasComponentRegistry(null)).toBe(false);
  });

  it("перечисляет типы, куда можно принять архив инвентаризации", () => {
    // Архив не несёт ни имени проекта, ни его типа. Пока ответ один — спрашивать
    // человека не о чем; станет несколько — вызывающая сторона это увидит.
    expect(componentRegistryProjectTypes()).toEqual(["upstream"]);
  });
});
