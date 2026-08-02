import { useLanguage } from "@/app/hooks/useLanguage";
import { getLeakCalculationFieldErrors } from "@/utils/calculations/calculations";

function calculationErrorMessage(code, lang) {
  const ru = {
    finite: "Введите корректное число",
    non_negative: "Значение не может быть отрицательным",
    positive: "Для розового мешка укажите значение больше нуля",
    above_absolute_zero: "Температура должна быть выше −273,15 °C",
  };
  const en = {
    finite: "Enter a valid number",
    non_negative: "Value cannot be negative",
    positive: "Enter a value above zero for Pink Bag",
    above_absolute_zero: "Temperature must be above −273.15 °C",
  };
  return (lang === "ru" ? ru : en)[code];
}

export function useStepValidation({ steps, form, setErrors, calculationVars }) {
  const { lang } = useLanguage();

  return function validateStep(stepIndex) {
    const step = steps[stepIndex - 1];
    if (!step?.fields) return true;

    const nextErrors = {};

    step.fields.forEach(({ key, required, type }) => {
      if (!required) return;

      if (type === "photo") {
        const photo = form[key];
        if (!photo || !photo.raw || !photo.src) {
          nextErrors[key] = lang === "ru" ? "Добавьте фото" : "Add a photo";
        }
        return;
      }

      const value = form[key];
      const empty =
        value == null || (typeof value === "string" && value.trim() === "");

      if (empty) {
        nextErrors[key] =
          lang === "ru" ? "Обязательное поле" : "Required field";
      }
    });

    const calculationErrors = getLeakCalculationFieldErrors(
      form,
      calculationVars,
    );
    step.fields.forEach(({ key }) => {
      if (calculationErrors[key]) {
        nextErrors[key] = calculationErrorMessage(calculationErrors[key], lang);
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
}
