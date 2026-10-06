import { describe, expect, it } from "vitest";
import { splitMaterials } from "./repairStage";

describe("splitMaterials", () => {
  it("splits positions by commas, semicolons and new lines", () => {
    expect(splitMaterials("Фланец, Прокладка; Болты\nГайки")).toEqual([
      "Фланец",
      "Прокладка",
      "Болты",
      "Гайки",
    ]);
  });

  it("keeps a name wrapped mid-phrase in one chip", () => {
    expect(
      splitMaterials(
        "Задвижка механическая DN-100 с ручным приводом с\nответными фланцами и крепежом.",
      ),
    ).toEqual([
      "Задвижка механическая DN-100 с ручным приводом с ответными фланцами и крепежом.",
    ]);
  });

  it("shows four positions and counts the rest as +N", () => {
    expect(splitMaterials("А, Б, В, Г, Д, Е")).toEqual([
      "А",
      "Б",
      "В",
      "Г",
      "+2",
    ]);
    expect(splitMaterials("А, Б, В, Г")).toEqual(["А", "Б", "В", "Г"]);
  });
});
