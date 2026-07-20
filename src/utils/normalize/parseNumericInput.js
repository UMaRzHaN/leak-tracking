/**
 * Coerces a raw input string during live typing.
 *
 * Final normalization is done by normalizeNumber on blur/save. Here we preserve
 * decimal text like "4,0" and "4.0" so the controlled input does not collapse
 * back to "4" while the user is still typing.
 */
export function parseNumericInput(raw) {
  if (raw === "" || raw == null) return "";

  let value = String(raw).trim();
  const negative = value.startsWith("-");

  value = value.replace(/[^\d.,]/g, "");

  if (value === "") return negative ? "-" : "";

  const dotIndex = value.indexOf(".");
  const commaIndex = value.indexOf(",");
  const separatorIndexes = [dotIndex, commaIndex].filter((idx) => idx !== -1);
  const firstSeparator =
    separatorIndexes.length > 0 ? Math.min(...separatorIndexes) : -1;

  if (firstSeparator !== -1) {
    const separator = value[firstSeparator];
    value =
      value.slice(0, firstSeparator + 1) +
      value.slice(firstSeparator + 1).replace(/[.,]/g, "");

    if (negative) {
      if (value === "") return "-";
      value = `-${value}`;
    }

    const normalized = value.replace(separator, ".");
    return Number.isFinite(Number(normalized)) ? value : "";
  }

  if (negative) {
    if (value === "") return "-";
    value = `-${value}`;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}
