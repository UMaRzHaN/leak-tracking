/**
 * Converts a timestamp (ms since epoch) to a short Russian relative-time string.
 * Returns null if older than 7 days — fall back to the formatted date field.
 * @param {number} timestamp
 */
export function timeAgo(timestamp) {
  if (!timestamp) return null;
  const diff = Date.now() - Number(timestamp);
  if (diff < 0) return null;

  if (diff < 60_000)          return "только что";
  if (diff < 3_600_000)       return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000)      return `${Math.floor(diff / 3_600_000)} ч назад`;
  if (diff < 7 * 86_400_000)  return `${Math.floor(diff / 86_400_000)} дн назад`;
  return null;
}
