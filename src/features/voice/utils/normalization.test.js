import { normalizeBySynonyms } from "./normalization";
import { normalizeStationName } from "./normalization";

describe("normalizeBySynonyms", () => {
  describe("пустой ввод", () => {
    it("returns { value: null, type: null } for null", () => {
      expect(normalizeBySynonyms(null, "component")).toEqual({
        value: null,
        type: null,
      });
    });

    it("returns { value: undefined, type: null } for undefined", () => {
      expect(normalizeBySynonyms(undefined, "component")).toEqual({
        value: undefined,
        type: null,
      });
    });
  });

  describe("компоненты", () => {
    it('"кран шаровый" → "Кран Шаровой"', () => {
      const { value, type } = normalizeBySynonyms("кран шаровый", "component");
      expect(value).toBe("Кран Шаровой");
      expect(type).toBe("Кран Шаровой");
    });

    it('"шаровый кран" → "Кран Шаровой"', () => {
      const { value } = normalizeBySynonyms("шаровый кран", "component");
      expect(value).toBe("Кран Шаровой");
    });

    it('"кша" (аббревиатура) → "Кран Шаровой"', () => {
      const { value } = normalizeBySynonyms("кша", "component");
      expect(value).toBe("Кран Шаровой");
    });

    it('"сппк" → "СППК" (верхний регистр для аббревиатур)', () => {
      const { value } = normalizeBySynonyms("сппк", "component");
      expect(value).toBe("СППК");
    });

    it('"эпуу" → "ЭПУУ"', () => {
      const { value } = normalizeBySynonyms("эпуу", "component");
      expect(value).toBe("ЭПУУ");
    });

    it('"змс" → "ЗМС"', () => {
      const { value } = normalizeBySynonyms("змс", "component");
      expect(value).toBe("ЗМС");
    });

    it("does not duplicate canonical value", () => {
      const { value } = normalizeBySynonyms("кран шаровой", "component");
      expect(value.match(/шаровой/gi)).toHaveLength(1);
    });
  });

  describe("тип привода", () => {
    it('"ручной" → "Механический ручной"', () => {
      const { value } = normalizeBySynonyms("ручной", "actuator_type");
      expect(value).toBe("Механический ручной");
    });

    it('"пневматический" → "Пневматический"', () => {
      const { value } = normalizeBySynonyms("пневматический", "actuator_type");
      expect(value).toBe("Пневматический");
    });

    it('"электро" → "Электрический"', () => {
      const { value } = normalizeBySynonyms("электро", "actuator_type");
      expect(value).toBe("Электрический");
    });
  });

  describe("тип присоединения", () => {
    it('"фланец" → "Фланцевое соединение"', () => {
      const { value } = normalizeBySynonyms("фланец", "connection_type");
      expect(value).toBe("Фланцевое соединение");
    });

    it('"резьба" → "Резьбовое соединение"', () => {
      const { value } = normalizeBySynonyms("резьба", "connection_type");
      expect(value).toBe("Резьбовое соединение");
    });
  });

  describe("причина утечки", () => {
    it('"коррозия" → "Коррозия"', () => {
      const { value } = normalizeBySynonyms("коррозия", "leak_cause");
      expect(value).toBe("Коррозия");
    });

    it('"износ" → "Износ уплотнений"', () => {
      const { value } = normalizeBySynonyms("износ", "leak_cause");
      expect(value).toBe("Износ уплотнений");
    });
  });

  describe("неизвестное поле (fallback)", () => {
    it("capitalizes each word when no dictionary for field", () => {
      const { value, type } = normalizeBySynonyms("some text", "unknown_field");
      expect(value).toBe("Some Text");
      expect(type).toBeNull();
    });
  });

  describe("самый длинный паттерн имеет приоритет", () => {
    it("matches full phrase before short phrase", () => {
      const { value } = normalizeBySynonyms(
        "фланцевое соединение",
        "connection_type",
      );
      expect(value).toBe("Фланцевое соединение");
    });
  });
});

describe("normalizeStationName", () => {
  describe("не строки", () => {
    it("returns null unchanged", () => {
      expect(normalizeStationName(null)).toBeNull();
    });

    it("returns number unchanged", () => {
      expect(normalizeStationName(42)).toBe(42);
    });
  });

  describe("КС без дефиса", () => {
    it('"кс5" → "КС-5"', () => {
      expect(normalizeStationName("кс5")).toBe("КС-5");
    });

    it('"кс 5" → "КС-5"', () => {
      expect(normalizeStationName("кс 5")).toBe("КС-5");
    });

    it('"кс5б" → "КС-5Б"', () => {
      expect(normalizeStationName("кс5б")).toBe("КС-5Б");
    });

    it('"дкс12" → "ДКС-12"', () => {
      expect(normalizeStationName("дкс12")).toBe("ДКС-12");
    });
  });

  describe("КС с дефисом (уже правильный формат)", () => {
    it('"кс-5" → "КС-5"', () => {
      expect(normalizeStationName("кс-5")).toBe("КС-5");
    });

    it('"ДКС-12А" → "ДКС-12А"', () => {
      expect(normalizeStationName("ДКС-12А")).toBe("ДКС-12А");
    });
  });

  describe("только КС/ДКС без номера", () => {
    it('"кс" → "КС"', () => {
      expect(normalizeStationName("кс")).toBe("КС");
    });

    it('"дкс" → "ДКС"', () => {
      expect(normalizeStationName("дкс")).toBe("ДКС");
    });
  });

  describe("латинские cs/dcs (распознавание голоса)", () => {
    it('"cs" → "КС"', () => {
      expect(normalizeStationName("cs")).toBe("КС");
    });

    it('"dcs 5" → "ДКС-5"', () => {
      expect(normalizeStationName("dcs 5")).toBe("ДКС-5");
    });
  });

  describe("обычный текст", () => {
    it("capitalizes plain words", () => {
      expect(normalizeStationName("северный газопровод")).toBe(
        "Северный Газопровод",
      );
    });

    it("handles КС in context", () => {
      expect(normalizeStationName("газопровод кс5")).toBe("Газопровод КС-5");
    });
  });

  describe("пробелы", () => {
    it("trims leading and trailing whitespace", () => {
      expect(normalizeStationName("  кс 5  ")).toBe("КС-5");
    });

    it("collapses internal spaces", () => {
      expect(normalizeStationName("кс  5")).toBe("КС-5");
    });
  });
});
