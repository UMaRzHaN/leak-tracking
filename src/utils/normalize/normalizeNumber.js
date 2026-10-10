// U+2212 («−») подставляют Excel, Word и часть клавиатур; без замены число
// теряло знак: «−5» превращалось в 5.
const UNICODE_MINUS = /−/g;

// Один и тот же знак повторяется группами ровно по три цифры: «1.234.567».
const REPEATED_THOUSANDS = /^\d{1,3}(?:([.,])\d{3})(?:\1\d{3})+$/;

/**
 * Приводит введённое или импортированное значение к числу.
 *
 * Разделители:
 * - есть и точка, и запятая — десятичный тот, что стоит последним, другой —
 *   разделитель тысяч: «1,234.5» → 1234.5, «1.234,56» → 1234.56;
 * - один знак повторяется группами по три цифры — это тысячи:
 *   «1.234.567» → 1234567;
 * - одна запятая или точка — десятичная, как и раньше: «12,5» → 12.5,
 *   «1,234» → 1.234 (неоднозначно, поэтому поведение не меняем);
 * - пробелы и неразрывные пробелы между тысячами отбрасываются.
 */
export const normalizeNumber = (raw) => {
  if (raw === "" || raw === null || raw === undefined) return "";

  let v = String(raw).trim().replace(UNICODE_MINUS, "-");

  // проверяем, есть ли минус в начале
  const isNegative = v.startsWith("-");

  // оставляем только цифры, точки и запятые (пробелы тысяч уходят здесь же)
  v = v.replace(/[^\d.,]/g, "");

  const lastDot = v.lastIndexOf(".");
  const lastComma = v.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    // последний из разделителей — десятичный, другой — тысячи
    v = v.split(lastDot > lastComma ? "," : ".").join("");
  } else if (REPEATED_THOUSANDS.test(v)) {
    v = v.replace(/[.,]/g, "");
  }

  // запятую заменяем на точку
  v = v.replace(",", ".");

  // оставляем только первую точку
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/[.,]/g, "");
  }

  if (v === "") return "";

  // возвращаем минус, если он был
  if (isNegative && v !== "") {
    v = "-" + v;
  }

  const num = Number(v);
  return Number.isFinite(num) ? num : "";
};
