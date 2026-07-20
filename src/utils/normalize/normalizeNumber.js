export const normalizeNumber = (raw) => {
  if (raw === "" || raw === null || raw === undefined) return "";

  let v = String(raw).trim();

  // проверяем, есть ли минус в начале
  const isNegative = v.startsWith("-");

  // оставляем только цифры, точки и запятые
  v = v.replace(/[^\d.,]/g, "");

  // запятую заменяем на точку
  v = v.replace(",", ".");

  // оставляем только одну точку
  v = v.replace(/(\..*)\./g, "$1");

  if (v === "") return "";

  // возвращаем минус, если он был
  if (isNegative && v !== "") {
    v = "-" + v;
  }

  const num = Number(v);
  return Number.isFinite(num) ? num : "";
};
