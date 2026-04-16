export const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return null;

  if (typeof v === "number") return v;

  const normalized = String(v).replace(",", ".");
  const num = Number(normalized);

  return Number.isFinite(num) ? num : null;
};
