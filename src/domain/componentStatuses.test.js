import { describe, expect, it } from "vitest";
import { usedComponentStatuses } from "@/domain/componentStatuses";

/**
 * Какие состояния железа предлагать в отборе — одно правило на реестр и карту.
 */
describe("состояния железа в отборе", () => {
  it("предлагает только встречающиеся", () => {
    // Показывать все словарные там, где половины нет, значит предлагать
    // фильтры, дающие пустой список.
    expect(
      usedComponentStatuses([
        { component_status: "В работе" },
        { component_status: "Требует замены" },
      ]),
    ).toEqual(["В работе", "Требует замены"]);
  });

  it("держит словарный порядок, а не порядок появления", () => {
    expect(
      usedComponentStatuses([
        { component_status: "Демонтирован" },
        { component_status: "В работе" },
      ]),
    ).toEqual(["В работе", "Демонтирован"]);
  });

  it("вписанные руками идут следом по алфавиту", () => {
    // Список открытый: у произвольных строк осмысленного порядка нет.
    expect(
      usedComponentStatuses([
        { component_status: "Ямная установка" },
        { component_status: "В работе" },
        { component_status: "Аварийное" },
      ]),
    ).toEqual(["В работе", "Аварийное", "Ямная установка"]);
  });

  it("пустое и пробелы за состояние не считаются", () => {
    expect(
      usedComponentStatuses([
        { component_status: "   " },
        { component_status: "" },
        {},
      ]),
    ).toEqual([]);
    expect(usedComponentStatuses(null)).toEqual([]);
  });

  it("повторы не удваивают вариант", () => {
    expect(
      usedComponentStatuses([
        { component_status: "В работе" },
        { component_status: "В работе" },
      ]),
    ).toEqual(["В работе"]);
  });
});
