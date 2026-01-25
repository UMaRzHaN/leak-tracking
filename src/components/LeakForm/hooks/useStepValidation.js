export function useStepValidation({ steps, form, setErrors }) {
  return function validateStep(stepIndex) {
    const step = steps[stepIndex - 1];
    if (!step?.fields) return true;

    const nextErrors = {};

    step.fields.forEach(({ key, required, type }) => {
      if (!required) return;

      if (type === "photo") {
        const photo = form[key];
        if (!photo || !photo.raw || !photo.src) {
          nextErrors[key] = "Добавьте фото";
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
