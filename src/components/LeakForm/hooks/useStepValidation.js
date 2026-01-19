import { STEP_REQUIRED } from "../constants";

export function useStepValidation(form, setErrors) {
  return function validateStep(step) {
    const fields = STEP_REQUIRED[step];
    if (!fields) return true;

    const nextErrors = {};
    fields.forEach((k) => {
      if (!form[k]) nextErrors[k] = "Обязательное поле";
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
}
