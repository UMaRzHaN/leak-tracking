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
});
