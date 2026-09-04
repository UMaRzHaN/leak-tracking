import { logger } from "@/utils/logger";
import { migrateLeakEvents } from "@/domain/leakEvents";
import { isValidLatitude, isValidLongitude } from "@/utils/coordinates";

/**
 * Проверка записи на входе из хранилища.
 *
 * Запись, не прошедшую проверку, не выбрасывают, а откладывают под символом:
 * файл проекта мог прийти из чужой сборки, и молча потерять из него строки —
 * худшее, что тут можно сделать. Читатель, который умеет их показать, спросит
 * их отдельно.
 */
const VALID_STATUSES = new Set(["open", "in_progress", "resolved"]);

export const PRESERVED_INVALID_RECORDS = Symbol("preservedInvalidLeakRecords");

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeOptionalNumber(value) {
  if (value == null) return value ?? null;
  return isFiniteNumber(value) ? value : undefined;
}

function isValidPhotoPath(value) {
  return (
    value == null ||
    (typeof value === "string" &&
      (value.startsWith("idb://") ||
        value.startsWith("data://") ||
        value.startsWith("zip:") ||
        value.startsWith("data:image/") ||
        value.startsWith("Documents/")))
  );
}

export function normalizeLeakRecord(item) {
  if (!item || typeof item !== "object") return null;
  if (!(typeof item.id === "string" || typeof item.id === "number"))
    return null;

  const lat = normalizeOptionalNumber(item.lat);
  const lng = normalizeOptionalNumber(item.lng);
  if (item.lat != null && lat === undefined) return null;
  if (item.lng != null && lng === undefined) return null;
  if (lat != null && !isValidLatitude(lat)) return null;
  if (lng != null && !isValidLongitude(lng)) return null;

  const status = item.status ?? "open";
  if (!VALID_STATUSES.has(status)) return null;
  if (
    !isValidPhotoPath(item.photo) ||
    !isValidPhotoPath(item.photo_after) ||
    !isValidPhotoPath(item.photo_repair)
  ) {
    return null;
  }

  // Лента событий разворачивается здесь, на общем пути чтения: сюда приходит
  // всё — хранилище, зеркало, архив, наследство прежних сборок, — и запись,
  // прошедшая мимо, осталась бы без ленты до первого сохранения.
  const normalized = migrateLeakEvents({
    ...item,
    status,
  });
  if (item.lat !== undefined) normalized.lat = lat;
  if (item.lng !== undefined) normalized.lng = lng;
  return normalized;
}

export function filterValidLeaks(arr, source) {
  if (!Array.isArray(arr)) return [];
  const valid = [];
  const preservedInvalid = [];
  const invalid = [];
  const seenIds = new Set();
  for (const item of arr) {
    const normalized = normalizeLeakRecord(item);
    const canonicalId = normalized ? String(normalized.id) : null;
    if (normalized && !seenIds.has(canonicalId)) {
      seenIds.add(canonicalId);
      valid.push(normalized);
    } else {
      invalid.push(item?.id ?? "?");
      preservedInvalid.push(item);
    }
  }
  if (invalid.length) {
    logger.warn(
      `[LeakRepository] ${source}: hid ${invalid.length} invalid records from the UI and preserved them in storage (id: ${invalid.join(", ")})`,
    );
  }
  if (preservedInvalid.length) {
    Object.defineProperty(valid, PRESERVED_INVALID_RECORDS, {
      value: preservedInvalid,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return valid;
}
