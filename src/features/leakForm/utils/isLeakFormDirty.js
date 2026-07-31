const DERIVED_FIELDS = new Set(["detectedBy"]);

function hasMeaningfulValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === "object") {
    return Object.values(value).some(hasMeaningfulValue);
  }
  return true;
}

export function isLeakFormDirty(form) {
  if (!form || typeof form !== "object") return false;
  return Object.entries(form).some(
    ([key, value]) => !DERIVED_FIELDS.has(key) && hasMeaningfulValue(value),
  );
}
