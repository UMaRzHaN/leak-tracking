import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const { useStepValidation } = await import("./useStepValidation");

const steps = [
  {
    fields: [
      { key: "component", required: true },
      { key: "note" },
      { key: "photo", required: true, type: "photo" },
    ],
  },
  { fields: [{ key: "leak_speed", required: true }] },
  { title: "без полей" },
];

const photo = { raw: "blob", src: "blob:1" };

let setErrors;

function validator(form, calculationVars = {}) {
  setErrors = vi.fn();
  const { result } = renderHook(() =>
    useStepValidation({ steps, form, setErrors, calculationVars }),
  );
  return result.current;
}

const errors = () => setErrors.mock.calls.at(-1)[0];

describe("useStepValidation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("шаг без полей пропускает без разговоров", () => {
    // Шаги нумеруются с единицы: третий — это steps[2].
    expect(validator({})(3)).toBe(true);
    expect(setErrors).not.toHaveBeenCalled();
  });

  it("держит на шаге, пока обязательное поле пусто", () => {
    const validate = validator({ photo });

    expect(validate(1)).toBe(false);
    expect(errors()).toEqual({ component: "Required field" });
  });

  it("считает пустым и пробелы, и отсутствие значения", () => {
    expect(validator({ component: "   ", photo })(1)).toBe(false);
    expect(errors().component).toBe("Required field");

    expect(validator({ component: null, photo })(1)).toBe(false);
    expect(errors().component).toBe("Required field");
  });

  it("необязательное поле пустым быть вправе", () => {
    const validate = validator({ component: "Кран", photo });

    expect(validate(1)).toBe(true);
    expect(errors()).toEqual({});
  });

  it("фотографии мало быть выбранной — нужен и файл, и превью", () => {
    // Половинчатый снимок означает, что сохранение потеряет либо картинку,
    // либо ссылку на неё.
    const base = { component: "Кран" };

    expect(validator({ ...base, photo: null })(1)).toBe(false);
    expect(errors().photo).toBe("Add a photo");

    expect(validator({ ...base, photo: { raw: "blob" } })(1)).toBe(false);
    expect(errors().photo).toBe("Add a photo");

    expect(validator({ ...base, photo: { src: "blob:1" } })(1)).toBe(false);
    expect(errors().photo).toBe("Add a photo");

    expect(validator({ ...base, photo })(1)).toBe(true);
  });

  it("не пускает дальше с нечисловой скоростью утечки", () => {
    const validate = validator({ leak_speed: "быстро" });

    expect(validate(2)).toBe(false);
    expect(errors().leak_speed).toBe("Enter a valid number");
  });

  it("не пускает дальше с отрицательной скоростью", () => {
    const validate = validator({ leak_speed: "-3" });

    expect(validate(2)).toBe(false);
    expect(errors().leak_speed).toBe("Value cannot be negative");
  });

  it("расчётную ошибку чужого шага здесь не показывает", () => {
    // Скорость правится на втором шаге; поднимать её ошибку на первом значит
    // указывать на поле, которого человек не видит.
    const validate = validator({
      component: "Кран",
      photo,
      leak_speed: "быстро",
    });

    expect(validate(1)).toBe(true);
    expect(errors()).toEqual({});
  });

  it("расчётная ошибка перебивает «обязательное поле» на том же ключе", () => {
    const validate = validator({ leak_speed: "-3" });

    expect(validate(2)).toBe(false);
    expect(errors()).toEqual({ leak_speed: "Value cannot be negative" });
  });
});
