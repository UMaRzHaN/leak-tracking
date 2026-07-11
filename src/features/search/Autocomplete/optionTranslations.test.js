import { describe, expect, it } from "vitest";
import { translateAutocompleteOption } from "./optionTranslations";

describe("translateAutocompleteOption", () => {
  it("translates long materials/equipment options with DN/PN specs", () => {
    const option =
      "Задвижка механическая стальная DN-100 PN-160 кгс/см² с ручным приводом с ответными фланцами и крепежом";

    expect(translateAutocompleteOption(option, "en")).toBe(
      "Steel gate valve DN-100 PN-160 кгс/см² with manual drive with mating flanges and fasteners",
    );
  });

  it("translates generic repair materials phrases", () => {
    const option =
      "Уплотнительные резинки, мембраны, фитинги, корпуса, прокладки, резьбовые соединения и места спайки";

    expect(translateAutocompleteOption(option, "en")).toBe(
      "Sealing rubber parts, membranes, fittings, housings, gaskets, threaded connections and soldered joints",
    );
  });

  it("keeps russian value for non-english locale", () => {
    const option = "Болты, шпильки и гайки";

    expect(translateAutocompleteOption(option, "ru")).toBe(option);
  });

  it("translates ball valve blowdown option without mixed russian tail", () => {
    const option =
      "Кран шаровой DN-15 PN-80 кгс/см² продувочной с ручным приводом, с концами под приварку надземной установки";

    expect(translateAutocompleteOption(option, "en")).toBe(
      "Ball valve DN-15 PN-80 кгс/см² blowdown with manual drive, with weld ends for aboveground installation",
    );
  });

  it("translates fitting-nipple connection option without mixed russian tail", () => {
    const option =
      "Кран шаровой DN-15 PN-80 кгс/см² штуцерно-нипельное соединение";

    expect(translateAutocompleteOption(option, "en")).toBe(
      "Ball valve DN-15 PN-80 кгс/см² fitting-nipple connection",
    );
  });
});
