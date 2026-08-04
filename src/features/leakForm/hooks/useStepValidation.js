import { useLanguage } from "@/app/hooks/useLanguage";
import { getLeakCalculationFieldErrors } from "@/utils/calculations/calculations";

export function useStepValidation({ steps, form, setErrors, calculationVars }) {
  const { t } = useLanguage();

  return function validateStep(stepIndex) {
    const step = steps[stepIndex - 1];
    if (!step?.fields) return true;

    const nextErrors = {};

    step.fields.forEach(({ key, required, type }) => {
      if (!required) return;

      if (type === "photo") {
        const photo = form[key];
        if (!photo || !photo.raw || !photo.src) {
          nextErrors[key] = t("leakForm.validation.photoRequired");
        }
        return;
      }

      const value = form[key];
      const empty =
        value == null || (typeof value === "string" && value.trim() === "");

      if (empty) {
        nextErrors[key] = t("leakForm.validation.required");
      }
    });

    const calculationErrors = getLeakCalculationFieldErrors(
      form,
      calculationVars,
    );
    step.fields.forEach(({ key }) => {
      if (calculationErrors[key]) {
        nextErrors[key] = t(`leakForm.validation.${calculationErrors[key]}`);
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
}
