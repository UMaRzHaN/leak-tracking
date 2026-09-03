import { describe, expect, it } from "vitest";
import {
  MAX_VOICE_CORRECTIONS,
  applyVoiceCorrections,
  normalizeVoiceCorrections,
} from "./voiceCorrections";

const pair = (from, to) => ({ from, to });

describe("нормализация поправок", () => {
  it("выбрасывает пустые и односторонние пары", () => {
    // Замена «ни на что» стирала бы сказанное молча.
    expect(
      normalizeVoiceCorrections([
        pair("", "месторождение"),
        pair("место рождения", ""),
        pair("  ", "  "),
        pair("место рождения", "месторождение"),
      ]),
    ).toEqual([pair("место рождения", "месторождение")]);
  });

  it("не хранит пару, которая ничего не меняет", () => {
    expect(normalizeVoiceCorrections([pair("Кран", "кран")])).toEqual([]);
  });

  it("схлопывает повторы по левой части, оставляя последнюю", () => {
    // Поправка правится повторным вводом, а не поиском старой.
    expect(
      normalizeVoiceCorrections([
        pair("кран шаровый", "Шаровой кран"),
        pair("Кран Шаровый", "Кран Шаровой"),
      ]),
    ).toEqual([pair("Кран Шаровый", "Кран Шаровой")]);
  });

  it("сводит пробелы внутри фразы", () => {
    expect(
      normalizeVoiceCorrections([pair("  кран   шаровый ", " Кран Шаровой ")]),
    ).toEqual([pair("кран шаровый", "Кран Шаровой")]);
  });

  it("не принимает мусор вместо списка", () => {
    expect(normalizeVoiceCorrections(null)).toEqual([]);
    expect(normalizeVoiceCorrections("месторождение")).toEqual([]);
    expect(normalizeVoiceCorrections([null, 42])).toEqual([]);
  });

  it("обрезает список, чтобы архив не пух", () => {
    const many = Array.from({ length: MAX_VOICE_CORRECTIONS + 10 }, (_, i) =>
      pair(`сказано ${i}`, `записано ${i}`),
    );

    expect(normalizeVoiceCorrections(many)).toHaveLength(MAX_VOICE_CORRECTIONS);
  });
});

describe("применение поправок", () => {
  const corrections = normalizeVoiceCorrections([
    pair("место рождения", "месторождение"),
    pair("кран", "Кран Шаровой"),
    pair("кран шаровый", "Кран Шаровой"),
  ]);

  it("правит распознанное, не трогая остального", () => {
    expect(
      applyVoiceCorrections("объект место рождения северное", corrections),
    ).toBe("объект месторождение северное");
  });

  it("предпочитает длинную фразу короткой", () => {
    // Иначе от «кран шаровый» осталась бы половина.
    expect(applyVoiceCorrections("компонент кран шаровый", corrections)).toBe(
      "компонент Кран Шаровой",
    );
  });

  it("не лезет внутрь слова", () => {
    // «Крановый» — не «кран», и поправка не должна его касаться.
    expect(applyVoiceCorrections("крановый узел", corrections)).toBe(
      "крановый узел",
    );
  });

  it("срабатывает независимо от того, как сказали", () => {
    expect(applyVoiceCorrections("Место Рождения", corrections)).toBe(
      "месторождение",
    );
  });

  it("не переписывает то, что уже заменил", () => {
    // Пара «кран» шире, чем «кран шаровый», и при последовательных заменах
    // находила слово в результате предыдущей: выходил «Кран Шаровой Шаровой».
    expect(applyVoiceCorrections("кран шаровый и кран", corrections)).toBe(
      "Кран Шаровой и Кран Шаровой",
    );
  });

  it("правит несколько мест в одной фразе", () => {
    expect(
      applyVoiceCorrections(
        "место рождения южное, компонент кран шаровый",
        corrections,
      ),
    ).toBe("месторождение южное, компонент Кран Шаровой");
  });

  it("возвращает текст как есть, когда поправок нет", () => {
    expect(applyVoiceCorrections("кран шаровый", [])).toBe("кран шаровый");
    expect(applyVoiceCorrections(null, corrections)).toBe("");
  });
});
