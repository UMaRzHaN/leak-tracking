export const LEAK_PHOTO_FIELDS = Object.freeze([
  "photo",
  "photo_after",
  "photo_repair",
]);

export const MONITORING_PHOTO_FIELDS = Object.freeze([
  "photo",
  "previousPhoto",
]);

export function collectMonitoringPhotoPaths(record) {
  return MONITORING_PHOTO_FIELDS.map((field) => record?.[field]).filter(
    Boolean,
  );
}
