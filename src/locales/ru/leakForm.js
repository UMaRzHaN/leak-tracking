export const leakForm = {
  calcShortcutHint: "Используются при сохранении этой утечки",

  // Keyed by the codes getLeakCalculationFieldErrors returns, so a new code
  // resolves to its own key rather than needing a mapping table.
  validation: {
    photoRequired: "Добавьте фото",
    required: "Обязательное поле",
    finite: "Введите корректное число",
    non_negative: "Значение не может быть отрицательным",
    positive: "Для розового мешка укажите значение больше нуля",
    above_absolute_zero: "Температура должна быть выше −273,15 °C",
  },
};
