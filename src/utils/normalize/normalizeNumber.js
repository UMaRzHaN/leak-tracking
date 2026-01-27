export const normalizeNumber = (raw) => {
  if (raw === "" || raw === null || raw === undefined) return "";
  let v = String(raw);
  v = v.replace(/[^\d.,]/g, "");
  v = v.replace(",", ".");
  v = v.replace(/(\..*)\./g, "$1");
  const num = Number(v);
  return Number.isFinite(num) ? num : "";
};
