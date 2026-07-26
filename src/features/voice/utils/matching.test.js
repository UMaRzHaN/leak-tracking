import { fuzzyMatchOption } from "./matching";

const OPTIONS = [
  "Кран Шаровой",
  "Кран Пробковый",
  "Обратный Клапан",
  "СППК",
  "Компрессорная станция/КС",
];

describe("fuzzyMatchOption", () => {
  describe("пустые входные данные", () => {
    it("returns null for empty string input", () => {
      expect(fuzzyMatchOption("", OPTIONS)).toBeNull();
    });

    it("returns null for null input", () => {
      expect(fuzzyMatchOption(null, OPTIONS)).toBeNull();
    });

    it("returns null for empty options array", () => {
      expect(fuzzyMatchOption("кран", [])).toBeNull();
    });

    it("returns null for null options", () => {
      expect(fuzzyMatchOption("кран", null)).toBeNull();
    });
  });

  describe("совпадения", () => {
    it("matches by shared words", () => {
      expect(fuzzyMatchOption("кран шаровой", OPTIONS)).toBe("Кран Шаровой");
    });

    it("matches reversed word order", () => {
      expect(fuzzyMatchOption("пробковый кран", OPTIONS)).toBe(
        "Кран Пробковый",
      );
    });

    it("matches single shared word", () => {
      expect(fuzzyMatchOption("шаровой", OPTIONS)).toBe("Кран Шаровой");
    });

    it("matches by prefix (partial word)", () => {
      // "шар" is a prefix of "шаровой"
      expect(fuzzyMatchOption("шар", OPTIONS)).toBe("Кран Шаровой");
    });

    it("is case-insensitive", () => {
      expect(fuzzyMatchOption("КРАН ШАРОВОЙ", OPTIONS)).toBe("Кран Шаровой");
    });

    it("picks best scoring option among multiple candidates", () => {
      // "обратный клапан" — 2 word matches with "Обратный Клапан", only 1 with others
      expect(fuzzyMatchOption("обратный клапан", OPTIONS)).toBe(
        "Обратный Клапан",
      );
    });
  });

  describe("нет совпадений", () => {
    it("returns null when no word overlap exists", () => {
      expect(fuzzyMatchOption("трубопровод метан", OPTIONS)).toBeNull();
    });

    it("ignores words shorter than 2 characters", () => {
      // Single-letter words are filtered out
      expect(fuzzyMatchOption("а б в", OPTIONS)).toBeNull();
    });
  });

  describe("сокращения после /", () => {
    it("strips all-caps abbreviation after slash", () => {
      // "Компрессорная станция/КС" — "КС" is all-caps abbreviation → stripped
      expect(fuzzyMatchOption("компрессорная", OPTIONS)).toBe(
        "Компрессорная станция",
      );
    });

    it("does not strip when part after slash contains lowercase cyrillic", () => {
      const opts = ["Кран/Задвижка"];
      expect(fuzzyMatchOption("задвижка", opts)).toBe("Кран/Задвижка");
    });

    it("does not strip when there is no slash", () => {
      expect(fuzzyMatchOption("сппк", OPTIONS)).toBe("СППК");
    });
  });
});

describe("voice parser regex helpers", () => {
  it("builds field marker lookahead and captures until the next marker", async () => {
    const { buildVoiceFieldMarkers, createVoiceValueRegex } =
      await import("./matching");
    const config = {
      object: { markers: "object" },
      component: { markers: "component" },
    };
    const markers = buildVoiceFieldMarkers(config);
    const match = [
      ..."object ball valve component flange".matchAll(
        createVoiceValueRegex("object", markers),
      ),
    ][0];
    expect(match.groups.value).toBe("ball valve");
  });

  it("captures signed localized numbers", async () => {
    const { createVoiceNumberRegex } = await import("./matching");
    const match = [
      ..."pressure -12,5".matchAll(createVoiceNumberRegex("pressure")),
    ][0];
    expect(match.groups.value).toBe("-12,5");
  });

  it("captures integer identifiers as strings", async () => {
    const { createVoiceIntegerRegex } = await import("./matching");
    const match = [..."tag 0012".matchAll(createVoiceIntegerRegex("tag"))][0];
    expect(match.groups.value).toBe("0012");
  });
});
