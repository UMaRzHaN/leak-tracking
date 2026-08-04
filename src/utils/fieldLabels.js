/**
 * The display name of a leak field.
 *
 * Every field the app configures has an entry under `addLeak.fields`, so the
 * fallback is only reached by keys that arrive from data rather than from a
 * config — a column from an imported file, say — where the key itself is the
 * most honest thing to show.
 */
export function fieldLabel(key, t, fallback) {
  return t(`addLeak.fields.${key}.label`, { defaultValue: fallback ?? key });
}

/**
 * The shorter variant the entry form uses, for fields whose full label would
 * crowd an input. Only some fields define one; the rest fall back to the full
 * label, which is what every field showed before the short form existed.
 */
export function shortFieldLabel(key, t, fallback) {
  return t(`addLeak.fields.${key}.shortLabel`, {
    defaultValue: fieldLabel(key, t, fallback),
  });
}
