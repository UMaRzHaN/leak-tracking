import { formatRelativeTime } from "@/utils/locale";

/**
 * Converts a timestamp to a short locale-aware relative-time string.
 * Returns null if older than 7 days so callers can fall back to an absolute date.
 * @param {number|string|Date} timestamp
 * @param {string} [language]
 */
export function timeAgo(timestamp, language) {
  return formatRelativeTime(timestamp, { language });
}
