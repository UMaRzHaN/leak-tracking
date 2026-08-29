import { describe, expect, it } from "vitest";
import { PROJECTS } from "@/configs/projects";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { COMPONENT_REGISTRY_LOADERS } from "@/configs/componentRegistryLoaders";
import { NUMERIC_FIELD_KEYS } from "@/configs/shared/fieldRegistry";

/**
 * Три факта о типах проекта вынесены в лёгкие модули, потому что их
 * спрашивают из стартового графа, а конфиг типа тянет за собой поля, словари,
 * шаги формы и колонки выгрузки. Здесь проверяется, что вынесенное не разошлось
 * с тем, от чего его отделили.
 *
 * Такое расхождение уже случалось: уровни места дублировались в конфиге
 * downstream и в общем конфиге с комментарием «менять только вместе» — и
 * разошлись на одну букву «ё». Комментарий рядом их не удержал; проверка
 * удержит.
 */
const types = Object.keys(PROJECTS);

describe("лёгкие объявления и конфиги типов", () => {
  it("уровни места берутся из общего конфига", () => {
    for (const type of types) {
      expect({ type, location: PROJECTS[type].system.location }).toEqual({
        type,
        location: PROJECT_LOCATION_CONFIG[type],
      });
    }
  });

  it("числовые поля у всех типов те же, что в общем списке", () => {
    for (const type of types) {
      const declared = (PROJECTS[type].system.numeric ?? []).map((field) =>
        typeof field === "string" ? field : field.key,
      );
      // Порядок не важен, состав важен: разбору ввода нужно множество.
      expect({ type, keys: [...declared].sort() }).toEqual({
        type,
        keys: [...NUMERIC_FIELD_KEYS].sort(),
      });
    }
  });

  it("загрузчик реестра у конфига тот же, что в общем объявлении", () => {
    for (const type of types) {
      expect(PROJECTS[type].components?.load).toBe(
        COMPONENT_REGISTRY_LOADERS[type],
      );
    }
  });

  it("общие объявления не описывают типов, которых нет", () => {
    // Запись про исчезнувший тип — след, который ничего не сдерживает.
    expect(Object.keys(PROJECT_LOCATION_CONFIG).sort()).toEqual(
      [...types].sort(),
    );
    expect(Object.keys(COMPONENT_REGISTRY_LOADERS).sort()).toEqual(
      [...types].sort(),
    );
  });
});
