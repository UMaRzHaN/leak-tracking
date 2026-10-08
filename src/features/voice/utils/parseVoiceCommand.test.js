import { parseVoiceCommand } from "./parseVoiceCommand";

describe("parseVoiceCommand", () => {
  it("parses Russian commands", () => {
    expect(parseVoiceCommand("следующий шаг", "ru")).toBe("next");
    expect(parseVoiceCommand("назад", "ru")).toBe("back");
    expect(parseVoiceCommand("сохранить", "ru")).toBe("save");
    expect(parseVoiceCommand("очистить", "ru")).toBe("clear");
  });

  it("parses English commands", () => {
    expect(parseVoiceCommand("next step", "en")).toBe("next");
    expect(parseVoiceCommand("previous", "en")).toBe("back");
    expect(parseVoiceCommand("save", "en")).toBe("save");
    expect(parseVoiceCommand("reset", "en")).toBe("clear");
  });

  it("keeps a fallback command set", () => {
    expect(parseVoiceCommand("сохранить", "en")).toBe("save");
    expect(parseVoiceCommand("next", "ru")).toBe("next");
  });

  it("ignores long field-like phrases", () => {
    expect(
      parseVoiceCommand("месторождение тенгиз локация куст 12", "ru"),
    ).toBe(null);
  });

  it("accepts recogniser punctuation around a command", () => {
    expect(parseVoiceCommand("Сохранить.", "ru")).toBe("save");
    expect(parseVoiceCommand("  Next step!  ", "en")).toBe("next");
  });

  it("does not treat dictation containing a command word as a command", () => {
    expect(parseVoiceCommand("описание очистить фланец", "ru")).toBe(null);
    expect(parseVoiceCommand("примечание сбросить давление", "ru")).toBe(null);
    expect(parseVoiceCommand("note cleared", "en")).toBe(null);
    expect(parseVoiceCommand("cause seal reset", "en")).toBe(null);
    expect(parseVoiceCommand("comment done", "en")).toBe(null);
    expect(parseVoiceCommand("cause backflow", "en")).toBe(null);
    expect(parseVoiceCommand("производитель Backer", "ru")).toBe(null);
  });
});
