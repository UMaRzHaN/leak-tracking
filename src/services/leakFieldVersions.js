import {
  nextSyncTimestamp,
  observeSyncTimestamp,
  sanitizeSyncTimestamp,
} from "@/services/syncClock";

export const LEAK_FIELD_VERSIONS_KEY = "_fieldUpdatedAt";

const EXCLUDED_KEYS = new Set([
  "id",
  "index",
  "created_at",
  "createdAt",
  "updatedAt",
  "importedAt",
  "importedFromExcel",
  "time",
  "history",
  "monitoringRecords",
  "monitoringTombstones",
  LEAK_FIELD_VERSIONS_KEY,
]);

function toTimestamp(value) {
  return observeSyncTimestamp(sanitizeSyncTimestamp(value));
}

function fallbackVersion(leak) {
  return Math.max(
    toTimestamp(leak?.updatedAt),
    toTimestamp(leak?.createdAt),
    toTimestamp(leak?.created_at),
  );
}

function identity(leak) {
  if (leak?.id != null) return `id:${String(leak.id)}`;
  const tag = String(leak?.leak_id ?? "").trim();
  return tag ? `tag:${tag}` : null;
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (left == null || right == null) return false;
  if (typeof left !== "object" || typeof right !== "object") return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isVersionedLeakField(key) {
  return !EXCLUDED_KEYS.has(key);
}

export function normalizeLeakFieldVersions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, timestamp]) => [key, toTimestamp(timestamp)])
      .filter(
        ([key, timestamp]) =>
          isVersionedLeakField(key) && Number(timestamp) > 0,
      ),
  );
}

export function getLeakFieldVersion(leak, key) {
  const versions = normalizeLeakFieldVersions(leak?.[LEAK_FIELD_VERSIONS_KEY]);
  return versions[key] ?? fallbackVersion(leak);
}

function monitoringIdentity(record) {
  if (record?.id != null) return `id:${String(record.id)}`;
  if (record?.roundId != null) return `round:${String(record.roundId)}`;
  const date = String(record?.date ?? "").trim();
  const round = String(record?.roundNumber ?? "").trim();
  return date || round ? `date:${date}|round:${round}` : null;
}

function isMonitoringVersionedField(key) {
  return !new Set([
    "id",
    "roundId",
    "updatedAt",
    "createdAt",
    "_fieldUpdatedAt",
  ]).has(key);
}

function stampMonitoringRecord(previousRecord, nextRecord, now) {
  const previousVersions = normalizeLeakFieldVersions(
    previousRecord?._fieldUpdatedAt,
  );
  const incomingVersions = normalizeLeakFieldVersions(
    nextRecord?._fieldUpdatedAt,
  );
  const versions = { ...previousVersions, ...incomingVersions };
  const keys = new Set([
    ...Object.keys(previousRecord ?? {}),
    ...Object.keys(nextRecord ?? {}),
  ]);
  const previousFallback = fallbackVersion(previousRecord);
  const initialVersion = Math.max(fallbackVersion(nextRecord), now);

  for (const key of keys) {
    if (!isMonitoringVersionedField(key)) continue;
    if (!previousRecord) {
      versions[key] = incomingVersions[key] ?? initialVersion;
      continue;
    }
    const previousVersion = previousVersions[key] ?? previousFallback;
    if (valuesEqual(previousRecord[key], nextRecord[key])) {
      versions[key] = Math.max(previousVersion, incomingVersions[key] ?? 0);
      continue;
    }
    const incomingVersion = incomingVersions[key] ?? 0;
    versions[key] =
      incomingVersion > previousVersion
        ? incomingVersion
        : Math.max(now, previousVersion + 1);
  }

  const normalizedVersions = normalizeLeakFieldVersions(versions);
  return {
    ...nextRecord,
    updatedAt: Math.max(fallbackVersion(nextRecord), now),
    ...(Object.keys(normalizedVersions).length > 0
      ? { _fieldUpdatedAt: normalizedVersions }
      : {}),
  };
}

function stampMonitoringRecords(previousRecords, nextRecords, now) {
  const previousByIdentity = new Map(
    (previousRecords ?? [])
      .map((record) => [monitoringIdentity(record), record])
      .filter(([key]) => key),
  );
  return (nextRecords ?? []).map((record) =>
    stampMonitoringRecord(
      previousByIdentity.get(monitoringIdentity(record)),
      record,
      now,
    ),
  );
}

export function stampLeakFieldVersions(previousLeaks, nextLeaks, now) {
  const effectiveNow =
    now == null ? nextSyncTimestamp() : sanitizeSyncTimestamp(now);
  const previousByIdentity = new Map(
    (previousLeaks ?? [])
      .map((leak) => [identity(leak), leak])
      .filter(([key]) => key),
  );

  return (nextLeaks ?? []).map((nextLeak) => {
    const previousLeak = previousByIdentity.get(identity(nextLeak));
    const stampedMonitoringRecords = stampMonitoringRecords(
      previousLeak?.monitoringRecords,
      nextLeak?.monitoringRecords,
      effectiveNow,
    );
    const previousVersions = normalizeLeakFieldVersions(
      previousLeak?.[LEAK_FIELD_VERSIONS_KEY],
    );
    const incomingVersions = normalizeLeakFieldVersions(
      nextLeak?.[LEAK_FIELD_VERSIONS_KEY],
    );
    const versions = { ...previousVersions, ...incomingVersions };
    const keys = new Set([
      ...Object.keys(previousLeak ?? {}),
      ...Object.keys(nextLeak ?? {}),
    ]);
    const previousFallback = fallbackVersion(previousLeak);
    const initialVersion = Math.max(fallbackVersion(nextLeak), effectiveNow);

    for (const key of keys) {
      if (!isVersionedLeakField(key)) continue;

      if (!previousLeak) {
        versions[key] = incomingVersions[key] ?? initialVersion;
        continue;
      }

      const previousVersion = previousVersions[key] ?? previousFallback;
      if (valuesEqual(previousLeak[key], nextLeak[key])) {
        versions[key] = Math.max(previousVersion, incomingVersions[key] ?? 0);
        continue;
      }

      const incomingVersion = incomingVersions[key] ?? 0;
      versions[key] =
        incomingVersion > previousVersion
          ? incomingVersion
          : Math.max(effectiveNow, previousVersion + 1);
    }

    const normalizedVersions = normalizeLeakFieldVersions(versions);
    const nextWithMonitoring = Array.isArray(nextLeak?.monitoringRecords)
      ? { ...nextLeak, monitoringRecords: stampedMonitoringRecords }
      : nextLeak;
    if (Object.keys(normalizedVersions).length === 0) return nextWithMonitoring;

    return {
      ...nextWithMonitoring,
      [LEAK_FIELD_VERSIONS_KEY]: normalizedVersions,
    };
  });
}
