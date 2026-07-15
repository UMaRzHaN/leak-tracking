export const SYSTEM_FIELD_KEYS = Object.freeze([
  "index",
  "date",
  "detectedBy",
  "status",
  "resolvedAt",
  "monitoringRecords",
  "roundNumber",
]);

export const SYSTEM_FIELD_KEY_SET = new Set(SYSTEM_FIELD_KEYS);

export function isSystemFieldKey(key) {
  return SYSTEM_FIELD_KEY_SET.has(key);
}

export function createFieldSets(fields) {
  const all = fields.map((field) => ({
    ...field,
    system: field.system ?? isSystemFieldKey(field.key),
  }));

  return {
    FIELDS: all,
    VIEW_FIELDS: all.filter((field) => field.viewable),
    EDIT_FIELDS: all.filter((field) => field.editable),
    COPY_FIELDS: all.filter((field) => field.copyable),
    NUMBER_FIELDS: all.filter((field) => field.numeric),
  };
}
