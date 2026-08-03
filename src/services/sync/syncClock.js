const CLOCK_STORAGE_KEY = "leak_tracking_sync_clock_v2";
const LEGACY_CLOCK_STORAGE_KEY = "leak_tracking_sync_clock_v1";

// Kept as a public compatibility constant for callers/tests that used the
// previous wall-clock guard. Synchronization versions are no longer clamped to
// the local wall clock: doing that loses causal order when another device has
// incorrect future time. Instead, every observed remote version advances this
// device's monotonic logical clock.
export const MAX_SYNC_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_SYNC_TIMESTAMP = Number.MAX_SAFE_INTEGER - 1;

function parseTimestamp(value) {
  if (value == null || value === "") return 0;
  const numeric = Number(value);
  const parsed =
    typeof value === "number" ||
    (typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(numeric))
      ? numeric
      : Date.parse(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  const normalized = Math.trunc(parsed);
  return normalized <= MAX_SYNC_TIMESTAMP ? normalized : 0;
}

/**
 * Validates a synchronization version without comparing it to the current
 * device clock. A remote version may legitimately be ahead because the peer's
 * wall clock is wrong; preserving it is necessary so a later local edit can
 * increment past it and propagate back to that peer.
 */
export function sanitizeSyncTimestamp(value) {
  return parseTimestamp(value);
}

function readStoredValue(key) {
  if (typeof localStorage === "undefined") return 0;
  try {
    return sanitizeSyncTimestamp(localStorage.getItem(key));
  } catch {
    return 0;
  }
}

function readLastTimestamp() {
  return Math.max(
    readStoredValue(CLOCK_STORAGE_KEY),
    readStoredValue(LEGACY_CLOCK_STORAGE_KEY),
  );
}

function writeLastTimestamp(value) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CLOCK_STORAGE_KEY, String(value));
    localStorage.removeItem(LEGACY_CLOCK_STORAGE_KEY);
  } catch {
    // A logical clock must remain usable even when storage is unavailable.
  }
}

/**
 * Records a version received from storage, an archive, or another device.
 * This is the "receive" step of a Lamport-style logical clock.
 */
export function observeSyncTimestamp(value) {
  const observed = sanitizeSyncTimestamp(value);
  if (!observed) return 0;
  const last = readLastTimestamp();
  if (observed > last) writeLastTimestamp(observed);
  return observed;
}

/**
 * Returns a monotonic synchronization version. It is based on wall time for
 * readability, but causality wins: the result is always greater than the last
 * local/remote version observed and greater than an explicit reference.
 */
export function nextSyncTimestamp(reference = 0, now = Date.now()) {
  const safeNow = sanitizeSyncTimestamp(now) || Date.now();
  const last = readLastTimestamp();
  const safeReference = sanitizeSyncTimestamp(reference);
  const causalBase = Math.max(last, safeReference);
  if (causalBase >= MAX_SYNC_TIMESTAMP) {
    throw new Error("Synchronization logical clock exhausted");
  }
  const next = Math.max(safeNow, causalBase + 1);
  writeLastTimestamp(next);
  return next;
}

export function resetSyncClockForTests() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(CLOCK_STORAGE_KEY);
    localStorage.removeItem(LEGACY_CLOCK_STORAGE_KEY);
  } catch {
    // Ignore test-environment storage failures.
  }
}
