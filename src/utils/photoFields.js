export const LEAK_PHOTO_FIELDS = Object.freeze([
  "photo",
  "photo_after",
  "photo_repair",
]);

export const MONITORING_PHOTO_FIELDS = Object.freeze([
  "photo",
  "previousPhoto",
]);

/**
 * Те же два поля, что и у записи обхода: событие осмотра — она и есть, только
 * с дописанным типом. Отдельная константа стоит здесь, чтобы у ленты событий
 * был свой список, когда записи обхода из неё уйдут.
 */
export const EVENT_PHOTO_FIELDS = MONITORING_PHOTO_FIELDS;

export function collectMonitoringPhotoPaths(record) {
  return MONITORING_PHOTO_FIELDS.map((field) => record?.[field]).filter(
    Boolean,
  );
}
