import { useLanguage } from "@/app/hooks/useLanguage";

export function useStepValidation({ steps, form, setErrors }) {
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

      if (!form[key]) {
        nextErrors[key] =
          lang === "ru" ? "Обязательное поле" : "Required field";
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
}
