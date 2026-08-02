const VALID_STATUSES = new Set(["open", "in_progress", "resolved"]);
const VALID_HISTORY_ACTIONS = new Set([
  "created",
  "edited",
  "status",
  "status_changed",
  "comment",
  "monitoring",
]);
const VALID_MONITORING_RESULTS = new Set([
  "still_leaking",
  "needs_recheck",
  "resolved",
  // Accepted for legacy backups created before monitoring results were split
  // from leak statuses.
  "open",
  "in_progress",
]);
const MAX_NESTED_TEXT_LENGTH = 10_000;
const MAX_HISTORY_CHANGES = 1_000;

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function pushIssue(issues, path, message) {
  issues.push({ path, message });
}

function isValidCalendarDate(year, month, day) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1970 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidClockTime(hour, minute, second = 0) {
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    Number.isInteger(second) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59
  );
}

function hasValidTimezoneOffset(value) {
  const offset = value.match(/([+-])(\d{2}):(\d{2})$/);
  if (!offset) return true;
  const [, , hours, minutes] = offset;
  const offsetHours = Number(hours);
  const offsetMinutes = Number(minutes);
  return offsetHours < 14 || (offsetHours === 14 && offsetMinutes === 0);
}

export function isValidBackupDate(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0;
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) return false;

  const localized = normalized.match(
    /^(\d{2})[./-](\d{2})[./-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/,
  );
  if (localized) {
    const [, day, month, year, hour, minute, second] = localized;
    return (
      isValidCalendarDate(Number(year), Number(month), Number(day)) &&
      (hour == null ||
        isValidClockTime(Number(hour), Number(minute), Number(second ?? 0))) &&
      hasValidTimezoneOffset(normalized)
    );
  }

  const iso = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/,
  );
  if (!iso) return false;
  const [, year, month, day, hour, minute, second] = iso;
  return (
    isValidCalendarDate(Number(year), Number(month), Number(day)) &&
    (hour == null ||
      isValidClockTime(Number(hour), Number(minute), Number(second ?? 0))) &&
    hasValidTimezoneOffset(normalized) &&
    Number.isFinite(Date.parse(normalized))
  );
}

function validateOptionalString(
  value,
  issues,
  path,
  { max = MAX_NESTED_TEXT_LENGTH } = {},
) {
  if (value == null) return;
  if (typeof value !== "string") {
    pushIssue(issues, path, "Expected string");
    return;
  }
  if (value.length > max) pushIssue(issues, path, "String value is too long");
}

function validateOptionalIdentifier(value, issues, path) {
  if (value == null) return;
  if (typeof value !== "string" && typeof value !== "number") {
    pushIssue(issues, path, "Expected string or number");
  }
}

function validateHistoryChange(change, path, issues) {
  if (!isPlainObject(change)) {
    pushIssue(issues, path, "Expected object");
    return;
  }
  validateOptionalString(change.key, issues, [...path, "key"], { max: 256 });
  if (typeof change.key !== "string" || change.key.trim().length === 0) {
    pushIssue(issues, [...path, "key"], "Expected non-empty string");
  }
  validateOptionalString(change.kind, issues, [...path, "kind"], { max: 64 });
  for (const field of ["from", "to"]) {
    const value = change[field];
    if (
      value != null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      pushIssue(issues, [...path, field], "Expected scalar value");
    }
  }
}

export function validateHistoryEntry(entry, path, issues) {
  if (!isPlainObject(entry)) {
    pushIssue(issues, path, "Expected object");
    return;
  }

  for (const field of ["action", "user", "monitoredBy", "detectedBy"]) {
    validateOptionalString(entry[field], issues, [...path, field], {
      max: 256,
    });
  }
  if (
    entry.action != null &&
    (typeof entry.action !== "string" ||
      !VALID_HISTORY_ACTIONS.has(entry.action))
  ) {
    pushIssue(issues, [...path, "action"], "Expected valid history action");
  }
  validateOptionalString(entry.text, issues, [...path, "text"]);

  if (entry.date != null && !isValidBackupDate(entry.date)) {
    pushIssue(issues, [...path, "date"], "Expected valid date");
  }
  for (const field of ["from", "to"]) {
    if (entry[field] != null && !VALID_STATUSES.has(entry[field])) {
      pushIssue(issues, [...path, field], "Expected valid leak status");
    }
  }

  if (entry.changes != null) {
    if (!Array.isArray(entry.changes)) {
      pushIssue(issues, [...path, "changes"], "Expected array");
    } else if (entry.changes.length > MAX_HISTORY_CHANGES) {
      pushIssue(issues, [...path, "changes"], "Array is too large");
    } else {
      entry.changes.forEach((change, changeIndex) =>
        validateHistoryChange(
          change,
          [...path, "changes", changeIndex],
          issues,
        ),
      );
    }
  }
}

export function validateMonitoringRecord(
  record,
  path,
  issues,
  isValidPortablePhotoPath,
) {
  if (!isPlainObject(record)) {
    pushIssue(issues, path, "Expected object");
    return;
  }

  validateOptionalIdentifier(record.id, issues, [...path, "id"]);
  validateOptionalString(record.roundId, issues, [...path, "roundId"], {
    max: 256,
  });
  for (const field of ["monitoredBy", "comment", "materials_equipment"]) {
    validateOptionalString(record[field], issues, [...path, field]);
  }

  if (record.date != null && !isValidBackupDate(record.date)) {
    pushIssue(issues, [...path, "date"], "Expected valid date");
  }
  if (
    record.roundNumber != null &&
    (!Number.isFinite(Number(record.roundNumber)) ||
      Number(record.roundNumber) <= 0)
  ) {
    pushIssue(issues, [...path, "roundNumber"], "Expected positive number");
  }
  if (
    record.result != null &&
    (typeof record.result !== "string" ||
      !VALID_MONITORING_RESULTS.has(record.result))
  ) {
    pushIssue(issues, [...path, "result"], "Expected valid monitoring result");
  }
  if (
    record.materialsChanged != null &&
    typeof record.materialsChanged !== "boolean"
  ) {
    pushIssue(issues, [...path, "materialsChanged"], "Expected boolean");
  }

  for (const field of ["photo", "previousPhoto"]) {
    if (record[field] != null && !isValidPortablePhotoPath(record[field])) {
      pushIssue(issues, [...path, field], "Недопустимый формат пути к фото");
    }
  }
}
