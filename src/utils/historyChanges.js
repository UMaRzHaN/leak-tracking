const EMPTY_VALUES = new Set([null, undefined, ""]);

function isEmpty(value) {
  return EMPTY_VALUES.has(value);
}

function comparableValue(value) {
  if (isEmpty(value)) return "";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return String(value);
  return String(value).trim();
}

function serializeValue(value) {
  if (isEmpty(value)) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  }
  return "[changed]";
}

function addValueChange(changes, before, after, key) {
  if (comparableValue(before[key]) === comparableValue(after[key])) return;

  changes.push({
    key,
    from: serializeValue(before[key]),
    to: serializeValue(after[key]),
  });
}

function addPhotoChange(changes, before, after, key) {
  const from = Boolean(before[key]);
  const to = Boolean(after[key]);

  if (from === to && before[key] === after[key]) return;

  changes.push({
    key,
    kind: "photo",
    from,
    to,
  });
}

export function buildLeakHistoryChanges({
  before,
  after,
  fields = [],
  includeKeys = [],
}) {
  const changes = [];
  const keys = new Set([
    ...fields.map((field) => field.key).filter(Boolean),
    ...includeKeys,
  ]);

  keys.forEach((key) => {
    if (key === "photo" || key === "photo_after") {
      addPhotoChange(changes, before, after, key);
      return;
    }

    addValueChange(changes, before, after, key);
  });

  return changes;
}
