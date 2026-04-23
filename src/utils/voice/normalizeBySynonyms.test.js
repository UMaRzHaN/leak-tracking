import { normalizeBySynonyms } from "./normalizeBySynonyms";

describe("normalizeBySynonyms", () => {
  describe("пустой ввод", () => {
    it("returns { value: null, type: null } for null", () => {
      expect(normalizeBySynonyms(null, "component")).toEqual({ value: null, type: null });
    });

    it("returns { value: undefined, type: null } for undefined", () => {
      expect(normalizeBySynonyms(undefined, "component")).toEqual({ value: undefined, type: null });
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
      expect(value).toBe("Механический ручной"); // canonical casing restored
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
      expect(value).toBe("Some Text"); // fallback capitalize() capitalizes all words
      expect(type).toBeNull();
    });
  });

  describe("самый длинный паттерн имеет приоритет", () => {
    it("matches full phrase before short phrase", () => {
      // "фланцевое соединение" is longer than "фланец"
      const { value } = normalizeBySynonyms("фланцевое соединение", "connection_type");
      expect(value).toBe("Фланцевое соединение");
    });
  });
});
