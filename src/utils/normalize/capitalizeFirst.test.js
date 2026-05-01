import { capitalizeFirst } from "./capitalizeFirst";

describe("capitalizeFirst", () => {
  describe("не строки", () => {
    it("returns number unchanged", () => {
      expect(capitalizeFirst(42)).toBe(42);
    });

    it("returns null unchanged", () => {
      expect(capitalizeFirst(null)).toBeNull();
    });

    it("returns undefined unchanged", () => {
      expect(capitalizeFirst(undefined)).toBeUndefined();
    });
  });

  describe("строки", () => {
    it("capitalizes first letter of lowercase string", () => {
      expect(capitalizeFirst("hello")).toBe("Hello");
    });

    it("leaves already-capitalized string unchanged", () => {
      expect(capitalizeFirst("Hello")).toBe("Hello");
    });

    it("capitalizes first Cyrillic letter", () => {
      expect(capitalizeFirst("газопровод")).toBe("Газопровод");
    });

    it("does not modify ALL-CAPS string (abbreviation)", () => {
      expect(capitalizeFirst("КШ")).toBe("КШ");
      expect(capitalizeFirst("СППК")).toBe("СППК");
    });

    it("does not modify string starting with digit", () => {
      expect(capitalizeFirst("5 метров")).toBe("5 метров");
      expect(capitalizeFirst("42")).toBe("42");
    });
  });

  describe("пустые и пробельные строки", () => {
    it("returns empty string for empty string", () => {
      expect(capitalizeFirst("")).toBe("");
    });

    it("returns empty string for whitespace-only input", () => {
      expect(capitalizeFirst("   ")).toBe("");
    });

    it("trims leading/trailing whitespace before capitalizing", () => {
      expect(capitalizeFirst("  hello")).toBe("Hello");
    });
  });
});
