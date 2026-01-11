export function normalizeSpokenNumber(value) {
  if (typeof value !== "string") return value;

  // убираем пробелы
  let v = value.trim();

  // если формат вида 2.546 — считаем, что это тысячи
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) {
    return v.replace(/\./g, "");
  }

  // если десятичная запятая
  if (/^\d+,\d+$/.test(v)) {
    return v.replace(",", ".");
  }

  return v;
}
