/**
 * Canonical comparison key for user-facing leak tags.
 *
 * The original spelling is kept on the record; this key is only used when
 * detecting duplicates or joining related data from imports/backups.
 */
export function normalizeLeakTag(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
