import { normalizeNumberWords } from "./numbers";

describe("normalizeNumberWords", () => {
  describe("пустой ввод", () => {
    it("returns null for null", () => {
      expect(normalizeNumberWords(null)).toBeNull();
    });

    it("returns empty string for empty string", () => {
      expect(normalizeNumberWords("")).toBe("");
    });

    it("leaves already-numeric text unchanged", () => {
      expect(normalizeNumberWords("скорость 5 давление 10")).toBe("скорость 5 давление 10");
    });
  });

  describe("словесные числа", () => {
    it("converts single digit word", () => {
      expect(normalizeNumberWords("пять")).toBe("5");
    });

    it("converts zero", () => {
      expect(normalizeNumberWords("ноль")).toBe("0");
    });

    it("converts tens", () => {
      expect(normalizeNumberWords("двадцать")).toBe("20");
    });

    it("converts compound number", () => {
      expect(normalizeNumberWords("двадцать пять")).toBe("25");
    });

    it("converts hundreds", () => {
      expect(normalizeNumberWords("сто")).toBe("100");
    });

    it("converts hundred + compound", () => {
      expect(normalizeNumberWords("сто двадцать три")).toBe("123");
    });
  });

  describe("десятичные числа из слов", () => {
    it('"два целых пять" → "2.5"', () => {
      expect(normalizeNumberWords("два целых пять")).toBe("2.5");
    });

    it('"два и пять" → "2.5"', () => {
      expect(normalizeNumberWords("два и пять")).toBe("2.5");
    });

    it('"два точка пять" → "2.5"', () => {
      expect(normalizeNumberWords("два точка пять")).toBe("2.5");
    });
  });

  describe("отрицательные числа", () => {
    it('"минус десять" → "-10"', () => {
      expect(normalizeNumberWords("минус десять")).toBe("-10");
    });

    it('"минус пять" → "-5"', () => {
      expect(normalizeNumberWords("минус пять")).toBe("-5");
    });
  });

  describe("размеры", () => {
    it('"50 на 40" → "50/40"', () => {
      expect(normalizeNumberWords("50 на 40")).toBe("50/40");
    });

    it('"пятьдесят на сорок" → "50/40"', () => {
      expect(normalizeNumberWords("пятьдесят на сорок")).toBe("50/40");
    });

    it('"10 дробь 20" → "10/20"', () => {
      expect(normalizeNumberWords("10 дробь 20")).toBe("10/20");
    });
  });

  describe("смешанный текст", () => {
    it("converts numbers within mixed text", () => {
      const result = normalizeNumberWords("скорость два целых семь давление пятнадцать");
      expect(result).toContain("2.7");
      expect(result).toContain("15");
    });

    it("preserves non-numeric words around numbers", () => {
      const result = normalizeNumberWords("бирка сто двадцать три станция кс-5");
      expect(result).toContain("123");
      expect(result).toContain("станция кс-5");
    });

    it("does not break already-digit values", () => {
      const result = normalizeNumberWords("бирка 5 скорость 10");
      expect(result).toBe("бирка 5 скорость 10");
    });
  });
});
