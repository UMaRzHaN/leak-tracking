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
  LEAK_FIELD_VERSIONS_KEY,
]);

function toTimestamp(value) {
  if (value == null || value === "") return 0;
  const numeric = Number(value);
  if (
    typeof value === "number" ||
    (typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(numeric))
  ) {
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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
      .filter(([key, timestamp]) => isVersionedLeakField(key) && timestamp > 0),
  );
}

export function getLeakFieldVersion(leak, key) {
  const versions = normalizeLeakFieldVersions(leak?.[LEAK_FIELD_VERSIONS_KEY]);
  return versions[key] ?? fallbackVersion(leak);
}

export function stampLeakFieldVersions(
  previousLeaks,
  nextLeaks,
  now = Date.now(),
) {
  const previousByIdentity = new Map(
    (previousLeaks ?? [])
      .map((leak) => [identity(leak), leak])
      .filter(([key]) => key),
  );

  return (nextLeaks ?? []).map((nextLeak) => {
    const previousLeak = previousByIdentity.get(identity(nextLeak));
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
    const initialVersion = fallbackVersion(nextLeak) || now;

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
          : Math.max(now, previousVersion + 1);
    }

    const normalizedVersions = normalizeLeakFieldVersions(versions);
    if (Object.keys(normalizedVersions).length === 0) return nextLeak;

    return {
      ...nextLeak,
      [LEAK_FIELD_VERSIONS_KEY]: normalizedVersions,
    };
  });
}
