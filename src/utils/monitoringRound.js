const MONITORING_ROUND_STORAGE_VERSION = "v2";
const LEGACY_MONITORING_ROUND_STORAGE_VERSION = "v1";

export function createMonitoringRound(number = 1) {
  return {
    id: `round-${Date.now()}`,
    number,
    startedAt: new Date().toISOString(),
  };
}

/**
 * @param {Record<string, any> | null | undefined} round
 * @param {string} [completedAt]
 * @param {Record<string, any> | null} [summary]
 */
export function completeMonitoringRound(
  round,
  completedAt = new Date().toISOString(),
  summary = null,
) {
  const normalized = normalizeMonitoringRound(round);
  if (!normalized) return null;
  return {
    ...normalized,
    completedAt,
    ...(summary ? { summary: { ...summary } } : {}),
  };
}

export function getMonitoringRoundStorageKey(projectId) {
  return projectId
    ? `app:${projectId}:monitoring_round_${MONITORING_ROUND_STORAGE_VERSION}`
    : null;
}

function getLegacyMonitoringRoundStorageKey(projectId) {
  return projectId
    ? `app:${projectId}:monitoring_round_${LEGACY_MONITORING_ROUND_STORAGE_VERSION}`
    : null;
}

export function normalizeMonitoringRound(round) {
  if (!round?.id || !round?.startedAt) return null;

  const normalized = {
    id: round.id,
    number: Number(round.number) > 0 ? Number(round.number) : 1,
    startedAt: round.startedAt,
  };
  if (typeof round.completedAt === "string" && round.completedAt) {
    normalized.completedAt = round.completedAt;
  }
  if (round.summary && typeof round.summary === "object") {
    normalized.summary = { ...round.summary };
  }
  return normalized;
}

export function readMonitoringRound(projectId) {
  const key = getMonitoringRoundStorageKey(projectId);
  if (!key || typeof localStorage === "undefined") return null;

  try {
    const current = normalizeMonitoringRound(
      JSON.parse(localStorage.getItem(key) ?? "null"),
    );
    if (current) return current;

    // Оба ключа строятся из одного projectId, и раз основной непустой — этот
    // тоже. Связь между ними нигде не записана, поэтому проверяется явно:
    // иначе при пустом ключе сюда ушло бы чтение по строке "null".
    const legacyKey = getLegacyMonitoringRoundStorageKey(projectId);
    if (!legacyKey) return null;
    const legacy = normalizeMonitoringRound(
      JSON.parse(localStorage.getItem(legacyKey) ?? "null"),
    );
    if (!legacy) return null;

    localStorage.setItem(key, JSON.stringify(legacy));
    localStorage.removeItem(legacyKey);
    return legacy;
  } catch {
    return null;
  }
}

export function saveMonitoringRound(projectId, round) {
  const key = getMonitoringRoundStorageKey(projectId);
  if (!key || typeof localStorage === "undefined") return;

  const normalized = normalizeMonitoringRound(round);
  if (normalized) localStorage.setItem(key, JSON.stringify(normalized));
  else localStorage.removeItem(key);
}

export function inferMonitoringRound(leaks = []) {
  const records = leaks.flatMap((leak) =>
    Array.isArray(leak?.monitoringRecords) ? leak.monitoringRecords : [],
  );
  const candidates = records.filter(
    (record) =>
      record?.date &&
      (record.roundId ||
        (Number.isFinite(Number(record.roundNumber)) &&
          Number(record.roundNumber) > 0)),
  );
  if (!candidates.length) return null;

  const latest = candidates.reduce((selected, record) => {
    if (!selected) return record;
    const selectedNumber = Number(selected.roundNumber) || 0;
    const recordNumber = Number(record.roundNumber) || 0;
    if (recordNumber !== selectedNumber) {
      return recordNumber > selectedNumber ? record : selected;
    }
    return Date.parse(record.date) > Date.parse(selected.date)
      ? record
      : selected;
  }, null);

  const latestNumber = Number(latest.roundNumber) || 1;
  const roundRecords = candidates.filter((record) =>
    latest.roundId
      ? record.roundId === latest.roundId
      : !record.roundId && Number(record.roundNumber) === latestNumber,
  );
  const startedAt = roundRecords.reduce(
    (earliest, record) =>
      Date.parse(record.date) < Date.parse(earliest) ? record.date : earliest,
    latest.date,
  );

  return normalizeMonitoringRound({
    id: latest.roundId ?? `legacy-round-${latestNumber}`,
    number: latestNumber,
    startedAt,
  });
}

export function getRestoredMonitoringRound(meta, leaks = []) {
  return (
    normalizeMonitoringRound(meta?.monitoringRound) ??
    inferMonitoringRound(leaks)
  );
}
