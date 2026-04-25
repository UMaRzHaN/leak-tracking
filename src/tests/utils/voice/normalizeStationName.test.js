import { normalizeStationName } from "../../../utils/voice/normalizeStationName";

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
      expect(normalizeStationName("северный газопровод")).toBe("Северный Газопровод");
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
