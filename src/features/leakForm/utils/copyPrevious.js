const SYSTEM_MANAGED_COPY_KEYS = new Set(["detectedBy"]);

export function getCopyPreviousKeys(copyable = []) {
  return copyable
    .map((field) => (typeof field === "string" ? field : field?.key))
    .filter(
      (key) => key && key !== "photo" && !SYSTEM_MANAGED_COPY_KEYS.has(key),
    );
}
