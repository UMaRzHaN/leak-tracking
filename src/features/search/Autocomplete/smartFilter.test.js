import { describe, it, expect } from "vitest";
import { smartFilter, isAbbreviation } from "./smartFilter";

// ── Материалы для тестов ──────────────────────────────────────────────────────
const MATERIALS = [
  "Задвижка механическая стальная DN-50 PN-160 кгс/см² с ручным приводом с ответными фланцами и крепежом",
  "Задвижка механическая стальная DN-100 PN-160 кгс/см² с ручным приводом с ответными фланцами и крепежом",
  "Задвижка механическая стальная DN-100 PN-64 кгс/см² с ручным приводом с ответными фланцами и крепежом",
  "Задвижка механическая стальная DN-80 PN-160 кгс/см² с ручным приводом с ответными фланцами и крепежом",
  "Кран шаровой DN-50 PN-64 кгс/см² с ручным приводом с надземной установки. с ответными фланцами и крепежом",
  "Кран шаровой DN-150 PN-64 кгс/см2 с ручным приводом с надземной установки. с ответными фланцами и крепежом",
  "Клапан запорный (вентиль) DN-15 PN-160 кгс/см² с муфтовой внутренней резьбой",
  "Клапан запорный (вентиль) DN-20 PN-64 кгс/см² с ответными фланцами и крепежом",
  "Регулирующий клапан DN-150 PN-64 с пневмоприводом",
  "Регулирующий клапан DN-50 PN-64 с пневмоприводом",
  "СППК DN-20 PN-16",
  "СППК DN-25 PN-64",
  "СППК DN-50 PN-16",
  "Обратный клапан 25/64",
];

const ADDRESSES = [
  "Дожимная компрессорная станция",
  "Компрессорная станция",
  "Дожимная насосная станция",
  "Газораспределительная станция",
  "Подземное хранилище газа",
  "Факельное хозяйство",
  "Газовый промысел",
];

// ── smartFilter ───────────────────────────────────────────────────────────────
describe("smartFilter", () => {
  describe("пустой запрос", () => {
    it("возвращает первые 20 опций при пустой строке", () => {
      const opts = Array.from({ length: 25 }, (_, i) => `item ${i}`);
      expect(smartFilter("", opts)).toHaveLength(20);
    });

    it("возвращает первые 20 опций при null/undefined", () => {
      const opts = Array.from({ length: 25 }, (_, i) => `item ${i}`);
      expect(smartFilter(null, opts)).toHaveLength(20);
    });

    it("works with option objects", () => {
      const opts = [
        {
          value: "Кран Шаровой",
          label: "Ball valve",
          keywords: ["кран шаровой"],
        },
        { value: "Вентиль", label: "Globe valve", keywords: ["вентиль"] },
      ];
      expect(smartFilter("ball", opts)[0]).toMatchObject({
        value: "Кран Шаровой",
        label: "Ball valve",
      });
      expect(smartFilter("кран", opts)[0]).toMatchObject({
        value: "Кран Шаровой",
        label: "Ball valve",
      });
    });

    it("matches TCU abbreviation in english autocomplete", () => {
      const opts = [
        {
          value: "Турбокомпрессорный Агрегат",
          label: "Turbocompressor unit",
          keywords: ["Турбокомпрессорный Агрегат"],
        },
      ];

      expect(smartFilter("tcu", opts)[0]).toMatchObject({
        value: "Турбокомпрессорный Агрегат",
        label: "Turbocompressor unit",
      });
    });
  });

  describe("поиск по аббревиатуре + DN/PN (формат XX/XX)", () => {
    it("змс 100/160 → правильная задвижка первой", () => {
      const result = smartFilter("змс 100/160", MATERIALS);
      expect(result[0]).toContain("DN-100");
      expect(result[0]).toContain("PN-160");
      expect(result[0].toLowerCase()).toContain(
        "задвижка механическая стальная",
      );
    });

    it("змс 50/160 → DN-50 PN-160 первой", () => {
      const result = smartFilter("змс 50/160", MATERIALS);
      expect(result[0]).toContain("DN-50");
      expect(result[0]).toContain("PN-160");
    });

    it("кш 50/64 → кран шаровой DN-50 PN-64 первым", () => {
      const result = smartFilter("кш 50/64", MATERIALS);
      expect(result[0]).toContain("DN-50");
      expect(result[0]).toContain("PN-64");
      expect(result[0].toLowerCase()).toContain("кран шаровой");
    });

    it("кзв 15/160 → клапан запорный DN-15 PN-160 первым", () => {
      const result = smartFilter("кзв 15/160", MATERIALS);
      expect(result[0]).toContain("DN-15");
      expect(result[0]).toContain("PN-160");
      expect(result[0].toLowerCase()).toContain("клапан запорный");
    });

    it("рк 150/64 → регулирующий клапан DN-150 PN-64 первым", () => {
      const result = smartFilter("рк 150/64", MATERIALS);
      expect(result[0]).toContain("DN-150");
      expect(result[0]).toContain("PN-64");
      expect(result[0].toLowerCase()).toContain("регулирующий клапан");
    });
  });

  describe("поиск по аббревиатуре + DN/PN (формат DN-XX PN-XX)", () => {
    it("DN-100 PN-160 → задвижка 100/160 первой", () => {
      const result = smartFilter("DN-100 PN-160", MATERIALS);
      expect(result[0]).toContain("DN-100");
      expect(result[0]).toContain("PN-160");
    });

    it("PN-64 DN-150 → результаты с этими параметрами", () => {
      const result = smartFilter("PN-64 DN-150", MATERIALS);
      expect(result[0]).toContain("DN-150");
      expect(result[0]).toContain("PN-64");
    });
  });

  describe("СППК — аббревиатура в самой опции", () => {
    it("сппк 20/16 → СППК DN-20 PN-16 первым", () => {
      const result = smartFilter("сппк 20/16", MATERIALS);
      expect(result[0]).toBe("СППК DN-20 PN-16");
    });

    it("сппк 25/64 → СППК DN-25 PN-64 первым", () => {
      const result = smartFilter("сппк 25/64", MATERIALS);
      expect(result[0]).toBe("СППК DN-25 PN-64");
    });

    it("сппк без чисел → все СППК в результатах", () => {
      const result = smartFilter("сппк", MATERIALS);
      expect(result.every((r) => r.toLowerCase().startsWith("сппк"))).toBe(
        true,
      );
    });
  });

  describe("поиск только по аббревиатуре (без чисел)", () => {
    it("змс → только задвижки механические стальные", () => {
      const result = smartFilter("змс", MATERIALS);
      expect(result.length).toBeGreaterThan(0);
      result.forEach((r) =>
        expect(r.toLowerCase()).toContain("задвижка механическая стальная"),
      );
    });

    it("кш → только краны шаровые", () => {
      const result = smartFilter("кш", MATERIALS);
      expect(result.length).toBeGreaterThan(0);
      result.forEach((r) => expect(r.toLowerCase()).toContain("кран шаровой"));
    });

    it("рк → только регулирующие клапаны", () => {
      const result = smartFilter("рк", MATERIALS);
      expect(result.length).toBeGreaterThan(0);
      result.forEach((r) =>
        expect(r.toLowerCase()).toContain("регулирующий клапан"),
      );
    });
  });

  describe("поиск по адресам/объектам", () => {
    it("дкс → дожимная компрессорная станция первой", () => {
      const result = smartFilter("дкс", ADDRESSES);
      expect(result[0]).toBe("Дожимная компрессорная станция");
    });

    it("пхг → подземное хранилище газа первым", () => {
      const result = smartFilter("пхг", ADDRESSES);
      expect(result[0]).toBe("Подземное хранилище газа");
    });

    it("фх → факельное хозяйство первым", () => {
      const result = smartFilter("фх", ADDRESSES);
      expect(result[0]).toBe("Факельное хозяйство");
    });

    it("грс → газораспределительная станция первой", () => {
      const result = smartFilter("грс", ADDRESSES);
      expect(result[0]).toBe("Газораспределительная станция");
    });
  });

  describe("регистронезависимость", () => {
    it("ЗМС 100/160 (верхний регистр) → тот же результат", () => {
      const lower = smartFilter("змс 100/160", MATERIALS);
      const upper = smartFilter("ЗМС 100/160", MATERIALS);
      expect(upper[0]).toBe(lower[0]);
    });

    it("ДКС (верхний регистр) → тот же результат", () => {
      const lower = smartFilter("дкс", ADDRESSES);
      const upper = smartFilter("ДКС", ADDRESSES);
      expect(upper[0]).toBe(lower[0]);
    });
  });

  describe("длинная аббревиатура побеждает короткую (рдг > рд)", () => {
    const RD_OPTIONS = [
      "Регулятор давления газа с пилотным управлением 100/25",
      "Регулятор давления",
    ];

    it("рдг → регулятор давления газа, а не просто регулятор давления", () => {
      const result = smartFilter("рдг", RD_OPTIONS);
      expect(result[0]).toContain("газа");
    });
  });

  describe("нет совпадений", () => {
    it("несуществующая аббревиатура → пустой массив", () => {
      const result = smartFilter("zzz 999/999", MATERIALS);
      expect(result).toHaveLength(0);
    });
  });
});

// ── isAbbreviation ────────────────────────────────────────────────────────────
describe("isAbbreviation", () => {
  it("змс 100/160 является сокращением для точного совпадения", () => {
    expect(
      isAbbreviation(
        "змс 100/160",
        "Задвижка механическая стальная DN-100 PN-160 кгс/см² с ручным приводом с ответными фланцами и крепежом",
      ),
    ).toBe(true);
  });

  it("кш 50/64 является сокращением для крана шарового", () => {
    expect(
      isAbbreviation(
        "кш 50/64",
        "Кран шаровой DN-50 PN-64 кгс/см² с ручным приводом с надземной установки. с ответными фланцами и крепежом",
      ),
    ).toBe(true);
  });

  it("случайный текст не является сокращением", () => {
    expect(isAbbreviation("привет мир", MATERIALS[0])).toBe(false);
  });
});
