/**
 * Finds the best match for a voice-recognized string among a list of canonical options.
 * Options may contain "/" separators like "Компрессорная станция/КС" — both parts are checked.
 *
 * Returns the matched canonical string, or null if no word overlap found.
 */
function wordScore(input, candidate) {
  const iWords = input
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const cWords = candidate
    .toLowerCase()
    .split(/[\s/]+/)
    .filter((w) => w.length >= 2);

  let hits = 0;
  for (const iw of iWords) {
    if (cWords.some((cw) => cw.startsWith(iw) || iw.startsWith(cw))) hits++;
  }
  return hits;
}

export function fuzzyMatchOption(input, options) {
  if (!input || !options?.length) return null;

  let best = null;
  let bestScore = 0;

  for (const opt of options) {
    const score = wordScore(input, opt);
    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }

  if (bestScore === 0) return null;
  const parts = best.split("/");
  const afterSlash = parts[parts.length - 1].trim();
  const isAbbrev = parts.length > 1 && !/[а-яёa-z]/.test(afterSlash);
  return isAbbrev ? parts.slice(0, -1).join("/").trim() : best;
}
