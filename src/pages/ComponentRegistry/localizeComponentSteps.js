/**
 * Puts the interface text onto the component step declarations.
 *
 * The declarations carry structure — which field, what type, which dictionary —
 * and nothing a translator would ever touch. Labels, the one-line explanation
 * under a field and the worked example inside it come from the locale, exactly
 * as the leak form assembles its own steps.
 *
 * The example matters more here than it looks: a walker filling a card in front
 * of equipment reads "напр. Мессояхское УПГ" and knows what shape of answer the
 * field wants, where a bare label leaves them guessing between a name, a number
 * and an abbreviation.
 *
 * Поля локации у карточки те же, что у утечки, и подсказки к ним уже написаны в
 * `addLeak.fields`. Поэтому они не переписываются здесь заново, а берутся
 * оттуда, если своей записи нет: у карточки своя нужна только там, где текст
 * утечки не подходит по смыслу. Собственный набор строк разошёлся бы с
 * оригиналом при первой же правке — как это уже случалось с разбором дат.
 *
 * Раньше запасного пути не было, и на типах «транспортировка» и «сбыт» три
 * верхних поля карточки стояли без подсказки и без примера вовсе: подписи были
 * только у полей добычи.
 */
function fieldText(t, key, part) {
  return t(`components.fields.${key}.${part}`, {
    defaultValue: t(`addLeak.fields.${key}.${part}`, { defaultValue: "" }),
  });
}

export function localizeComponentSteps(steps, t) {
  return steps.map((step) => ({
    ...step,
    fields: step.fields.map((field) => ({
      ...field,
      label: t(`components.fields.${field.key}.label`, {
        defaultValue: field.label,
      }),
      hint: fieldText(t, field.key, "hint"),
      placeholder: fieldText(t, field.key, "placeholder"),
    })),
  }));
}
