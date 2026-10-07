/**
 * Russian needs three plural forms where English needs two; Intl.PluralRules
 * picks the one this count takes and the locale carries every form
 * (`database.records`: «1 запись», «2 записи», «5 записей»).
 */
export function pluralRecords(count, t, intlLocale) {
  const form = new Intl.PluralRules(intlLocale).select(count);
  return t(`database.records.${form}`);
}
