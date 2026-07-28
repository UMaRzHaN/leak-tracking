function asFiniteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function compareLeakIds(left, right) {
  const leftId = left?.id;
  const rightId = right?.id;
  const leftNumber = asFiniteNumber(leftId);
  const rightNumber = asFiniteNumber(rightId);

  if (leftNumber != null && rightNumber != null) {
    return leftNumber - rightNumber;
  }

  return String(leftId ?? "").localeCompare(String(rightId ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
