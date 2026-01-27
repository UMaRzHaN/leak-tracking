export const normalizeRow = (row = {}) => {
  const result = {};

  Object.entries(row).forEach(([key, val]) => {
    if (val && typeof val === "object" && "value" in val && "text" in val) {
      result[`${key}_value`] = val.value ?? "";
      result[`${key}_text`] = val.text ?? "";
    } else {
      result[key] = val ?? "";
    }
  });

  return result;
};