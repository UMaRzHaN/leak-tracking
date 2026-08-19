/**
 * The previous record's values, shown greyed out in the fields still empty.
 *
 * A walk is repetitive by nature — the same subdivision, the same medium, the
 * same connection type down a whole line — and the fastest way to say "this
 * one too" is to see what the last one said. The value is only a placeholder:
 * nothing is written until it is typed or the copy offer at save is accepted.
 *
 * Only empty fields, and never the photo: what somebody typed here describes
 * the thing in front of them and is never overwritten by the record before it.
 *
 * @param {object|null} lastItem the previous record
 * @param {{key: string, type?: string}[]} fields the fields of the current step
 * @param {object} form what is filled in so far
 * @returns {Record<string, string>}
 */
export function buildGhostPlaceholders(lastItem, fields, form) {
  if (!lastItem) return {};

  /** @type {Record<string, string>} */
  const placeholders = {};
  for (const field of fields ?? []) {
    if (field.type === "photo") continue;

    const current = form?.[field.key];
    if (current != null && String(current).trim() !== "") continue;

    const previous = lastItem[field.key];
    if (previous == null || String(previous).trim() === "") continue;

    placeholders[field.key] = String(previous);
  }
  return placeholders;
}
