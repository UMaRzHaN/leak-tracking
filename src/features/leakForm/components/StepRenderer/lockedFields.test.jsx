import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("react-i18next", async () => {
  const { translate } = await import("@/test/translate");
  return { useTranslation: () => ({ t: translate, i18n: { language: "en" } }) };
});

const StepRenderer = (await import("./StepRenderer")).default;

const steps = [
  {
    title: "Основное",
    fields: [
      { type: "input", key: "subdivision", label: "Подразделение" },
      { type: "autocomplete", key: "object", label: "Объект", options: [] },
      { type: "input", key: "leak_id", label: "Бирка" },
    ],
  },
];

function draw(lockedKeys) {
  render(
    <StepRenderer
      step={1}
      steps={steps}
      form={{ subdivision: "УПГ-Север", object: "Дренаж", leak_id: "4242" }}
      errors={{}}
      onChange={() => {}}
      nextStep={() => {}}
      save={() => {}}
      lockedKeys={lockedKeys}
    />,
  );
}

const поле = (label) => screen.getByLabelText(new RegExp(label));

/**
 * Место приходит из карточки реестра и правке не подлежит, пока связь стоит.
 * Бирка утечки к карточке отношения не имеет: у компонента свой номер, у
 * утечки свой, и запирать её нельзя.
 */
describe("запертые поля шага", () => {
  it("запирает то, что заполнила карточка", () => {
    draw(new Set(["subdivision", "object"]));

    expect(поле("Подразделение")).toHaveAttribute("readonly");
    expect(поле("Объект")).toHaveAttribute("readonly");
  });

  it("оставляет бирку утечки открытой", () => {
    draw(new Set(["subdivision", "object"]));

    expect(поле("Бирка")).not.toHaveAttribute("readonly");
  });

  it("ничего не запирает без связи", () => {
    draw(null);

    expect(поле("Подразделение")).not.toHaveAttribute("readonly");
    expect(поле("Объект")).not.toHaveAttribute("readonly");
  });

  it("прячет крестик очистки у запертого поля", () => {
    // Крестик обещал бы, что значение можно убрать, — а оно не своё.
    draw(new Set(["subdivision"]));

    const очистки = screen.queryAllByRole("button", { name: /clear/i });
    expect(очистки).toHaveLength(2);
  });
});
