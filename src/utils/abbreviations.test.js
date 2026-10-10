import { describe, expect, it } from "vitest";
import { shortenPlaceName } from "./abbreviations";

describe("shortenPlaceName", () => {
  it("shortens long facility names from the abbreviation dictionary", () => {
    expect(shortenPlaceName("Газлийское нефтегазодобывающее управление")).toBe(
      "Газлийское НГДУ",
    );
    expect(shortenPlaceName("Газлийское Нефтегазодобывающее  Управление")).toBe(
      "Газлийское НГДУ",
    );
    expect(
      shortenPlaceName("Установка комплексной подготовки газа «Шуртан»"),
    ).toBe("УКПГ «Шуртан»");
    // Длинная фраза раньше короткой: не «нефте» + «ГДУ».
    expect(shortenPlaceName("Газодобывающее управление")).toBe("ГДУ");
    expect(shortenPlaceName("Шуртанский газохимический комплекс")).toBe(
      "Шуртанский ГХК",
    );
    expect(shortenPlaceName("Мубарекский газоперерабатывающий завод")).toBe(
      "Мубарекский ГПЗ",
    );
  });

  it("leaves single words, names without phrases and non-strings alone", () => {
    expect(shortenPlaceName("Пылеуловитель №3")).toBe("Пылеуловитель №3");
    expect(shortenPlaceName("ДКС-1")).toBe("ДКС-1");
    expect(shortenPlaceName("Скважина №81")).toBe("Скважина №81");
    expect(shortenPlaceName("")).toBe("");
    expect(shortenPlaceName(null)).toBe(null);
  });
});
