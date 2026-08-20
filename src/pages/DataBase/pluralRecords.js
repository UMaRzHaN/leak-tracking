/**
 * Russian needs three plural forms where English needs two; Intl.PluralRules
 * picks the one this count takes and the locale carries every form.
 *
 * Two sets exist because the two call sites need different cases: the counter
 * says «1 запись» (nominative, `database.records`), the bulk notice says
 * «у 1 записи» (genitive, `database.bulk.records`).
 */
export function pluralRecords(count, t, intlLocale, path = "database.records") {
  const form = new Intl.PluralRules(intlLocale).select(count);
  return t(`${path}.${form}`);
}
