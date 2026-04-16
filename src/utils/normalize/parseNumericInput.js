/**
 * Coerces a raw input string to a number during live typing.
 *
 * Unlike normalizeNumber (which is for final save), this preserves
 * partial-input states so the user can type decimals freely:
 *   "3."   → "3."   (keep as string — user might type "3.5" next)
 *   "-"    → "-"    (keep — user is starting a negative number)
 *   "3.5"  → 3.5    (complete → return as Number)
 *   ""     → ""
 *   "abc"  → ""
 */
export function parseNumericInput(raw) {
  if (raw === "" || raw == null) return "";

  let v = String(raw).trim();
  const neg = v.startsWith("-");

  // Strip everything except digits, dot and comma
  v = v.replace(/[^\d.,]/g, "");

  // Normalise comma → dot
  v = v.replace(",", ".");

  // Drop every extra dot after the first
  const di = v.indexOf(".");
  if (di !== -1) {
    v = v.slice(0, di + 1) + v.slice(di + 1).replace(/\./g, "");
  }

  // Restore minus
  if (neg) {
    if (v === "") return "-";   // just a minus → keep partial
    v = "-" + v;
  }

  // Trailing dot → keep as partial string so user can continue typing
  if (v.endsWith(".")) return v;

  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}
