import { STEP_REQUIRED } from "../constants";

export function useStepValidation(form, setErrors) {
  return function validateStep(step) {
    const fields = STEP_REQUIRED[step];
    if (!fields) return true;

    const nextErrors = {};

    fields.forEach((key) => {
      if (key === "photo") {
        const photo = form.photo;
        if (!photo || !photo.raw || !photo.src) {
          nextErrors.photo = "Добавьте фото";
        }
        return;
      }

      if (!form[key]) {
        nextErrors[key] = "Обязательное поле";
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
}
