export function normalizeSpokenNumber(value) {
  if (typeof value !== "string") return value;

  let v = value.trim();

  // 1️⃣ Формат: 2.546,3 → 2546.3
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(v)) {
    return v.replace(/\./g, "").replace(",", ".");
  }

  // 2️⃣ Формат: 2.546 → 2546
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) {
    return v.replace(/\./g, "");
  }

  // 3️⃣ Формат: 12,5 → 12.5
  if (/^\d+,\d+$/.test(v)) {
    return v.replace(",", ".");
  }

  return v;
}
