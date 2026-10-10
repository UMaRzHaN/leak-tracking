function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Поле `rounds` в `project.json`: обходы ремонтов и сверки (см.
 * projectRounds). У каждого вида — обход с номером и началом или явный
 * `null` («обхода не было»).
 *
 * @param {unknown} rounds
 * @returns {{ path: (string|number)[], message: string }[]}
 */
export function validateRoundsMeta(rounds) {
  if (rounds === undefined) return [];
  if (!isPlainObject(rounds)) {
    return [{ path: ["rounds"], message: "Expected object" }];
  }
  return Object.entries(/** @type {Record<string, any>} */ (rounds))
    .filter(
      ([, round]) =>
        round !== null &&
        (!isPlainObject(round) ||
          typeof round.startedAt !== "string" ||
          !(Number(round.number) > 0)),
    )
    .map(([kind]) => ({
      path: ["rounds", kind],
      message: "Expected round or null",
    }));
}
