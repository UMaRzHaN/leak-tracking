export const MONITORING_RESULT = {
  STILL_LEAKING: "still_leaking",
  RESOLVED: "resolved",
  NEEDS_RECHECK: "needs_recheck",
};

export const MONITORING_RESULT_ORDER = [
  MONITORING_RESULT.STILL_LEAKING,
  MONITORING_RESULT.NEEDS_RECHECK,
  MONITORING_RESULT.RESOLVED,
];

const RESULT_LABELS = {
  ru: {
    still_leaking: "Утечка сохраняется",
    resolved: "Утечка устранена",
    needs_recheck: "Утечка в ремонте",
  },
  en: {
    still_leaking: "Still leaking",
    resolved: "Resolved",
    needs_recheck: "Leak under repair",
  },
};

export function getMonitoringResultLabel(result, lang = "ru") {
  return (
    RESULT_LABELS[lang]?.[result] ??
    RESULT_LABELS.ru[result] ??
    String(result ?? "")
  );
}

export function getMonitoringRecords(leak) {
  return Array.isArray(leak?.monitoringRecords)
    ? leak.monitoringRecords.filter((record) => record && record.date)
    : [];
}

export function getLastMonitoringRecord(leak) {
  const records = getMonitoringRecords(leak);
  if (records.length === 0) return null;

  return records.reduce((latest, record) => {
    const latestTime = Date.parse(latest.date);
    const recordTime = Date.parse(record.date);
    return recordTime > latestTime ? record : latest;
  }, records[0]);
}

export function isMonitoringDue(leak, roundId = null, roundNumber = null) {
  const records = getMonitoringRecords(leak);
  const normalizedRoundNumber = Number(roundNumber);
  const hasRoundNumber =
    Number.isFinite(normalizedRoundNumber) && normalizedRoundNumber > 0;
  if (!roundId && !hasRoundNumber) return records.length === 0;

  return !records.some((record) => {
    if (roundId && record.roundId === roundId) return true;
    return (
      !record.roundId &&
      hasRoundNumber &&
      Number(record.roundNumber) === normalizedRoundNumber
    );
  });
}

export function formatMonitoringDate(value, lang = "ru") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
