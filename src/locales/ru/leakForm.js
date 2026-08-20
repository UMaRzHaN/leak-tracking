export const leakForm = {
  calcShortcutHint: "Используются при сохранении этой утечки",

  // Keyed by the codes getLeakCalculationFieldErrors returns, so a new code
  // resolves to its own key rather than needing a mapping table.
  // Связь утечки с карточкой компонента.
  componentLink: {
    title: "Компонент из реестра",
    pick: "Выбрать из реестра",
    change: "Другая карточка",
    unlink: "Открепить",
    searchLabel: "Поиск по номеру или наименованию",
    searchPlaceholder: "Номер, наименование, номер на схеме...",
    loading: "Читаем реестр...",
    failed: "Реестр не прочитался",
    empty: "Реестр пуст — заводить карточки начинают на площадке.",
    nothingFound: "Ничего не нашлось",
    nearestFirst: "Сначала ближние",
    noFix: "Без координат порядок обычный: приёмник молчит",
    unnamed: "Без наименования",
    metersAway: "{{v1}} м",
    farAway: "далеко",
    noCoords: "без координат",
  },
  validation: {
    photoRequired: "Добавьте фото",
    required: "Обязательное поле",
    finite: "Введите корректное число",
    non_negative: "Значение не может быть отрицательным",
    positive: "Для розового мешка укажите значение больше нуля",
    above_absolute_zero: "Температура должна быть выше −273,15 °C",
  },
};
