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
 */
export function localizeComponentSteps(steps, t) {
  return steps.map((step) => ({
    ...step,
    fields: step.fields.map((field) => ({
      ...field,
      label: t(`components.fields.${field.key}.label`, {
        defaultValue: field.label,
      }),
      hint: t(`components.fields.${field.key}.hint`, { defaultValue: "" }),
      placeholder: t(`components.fields.${field.key}.placeholder`, {
        defaultValue: "",
      }),
    })),
  }));
}
