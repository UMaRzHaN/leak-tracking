import { formatMomentDate, parseDateValue } from "./cellDates";
import { migrateLeakEvents } from "@/domain/leakEvents";
import { normalizeLeakTag } from "@/utils/leakIdentity";

function statusFromMonitoringResult(result) {
  if (result === "resolved") return "resolved";
  if (result === "needs_recheck") return "in_progress";
  return "open";
}

function historyRecordIdentity(record) {
  return JSON.stringify([
    Date.parse(record?.date) || String(record?.date ?? ""),
    record?.action ?? "",
    record?.to ?? "",
    record?.text ?? "",
    record?.user ?? "",
    record?.changes ?? [],
  ]);
}

function normalizeRecordMap(recordsByLeakId) {
  const normalized = new Map();
  for (const [leakId, records] of recordsByLeakId ?? []) {
    const key = normalizeLeakTag(leakId);
    if (!key) continue;
    normalized.set(key, [...(normalized.get(key) ?? []), ...(records ?? [])]);
  }
  return normalized;
}

function normalizeLeakTagSet(values) {
  return new Set([...(values ?? [])].map(normalizeLeakTag).filter(Boolean));
}

export function mergeHistoryRecords(
  existingRecords = [],
  incomingRecords = [],
) {
  const byIdentity = new Map();
  for (const record of [...existingRecords, ...incomingRecords]) {
    byIdentity.set(historyRecordIdentity(record), record);
  }
  return [...byIdentity.values()].sort(
    (left, right) => Date.parse(left.date) - Date.parse(right.date),
  );
}

export function attachMonitoringRecords(
  leaks,
  recordsByLeakId,
  { inferStatusForLeakIds = new Set() } = {},
) {
  if (!recordsByLeakId.size) return leaks;
  const normalizedRecords = normalizeRecordMap(recordsByLeakId);
  const normalizedInferredIds = normalizeLeakTagSet(inferStatusForLeakIds);

  return leaks.map((leak) => {
    const leakId = normalizeLeakTag(leak.leak_id);
    const records = normalizedRecords.get(leakId);
    if (!records?.length) return leak;

    const monitoringRecords = [
      ...(Array.isArray(leak.monitoringRecords) ? leak.monitoringRecords : []),
      ...records,
    ].sort((left, right) => {
      const dateDifference = Date.parse(left.date) - Date.parse(right.date);
      if (dateDifference !== 0) return dateDifference;
      return Number(left.roundNumber ?? 0) - Number(right.roundNumber ?? 0);
    });

    const monitoringHistory = records.map((record) => ({
      action: "monitoring",
      date: record.date,
      to: statusFromMonitoringResult(record.result),
      user: record.monitoredBy || "Excel import",
      text: record.comment || "",
    }));

    const next = {
      ...leak,
      monitoringRecords,
      history: mergeHistoryRecords(
        Array.isArray(leak.history) ? leak.history : [],
        monitoringHistory,
      ),
      updatedAt: Math.max(
        Number(leak.updatedAt) || 0,
        ...records.map((record) => Date.parse(record.date) || 0),
      ),
    };

    if (normalizedInferredIds.has(leakId)) {
      const latestMonitoring = monitoringRecords[monitoringRecords.length - 1];
      next.status = statusFromMonitoringResult(latestMonitoring?.result);
      if (next.status === "resolved") {
        const resolvedDate = parseDateValue(latestMonitoring?.date);
        // Дата обхода — момент со временем, и день у неё местный.
        if (resolvedDate) next.resolvedAt = formatMomentDate(resolvedDate);
      } else {
        delete next.resolvedAt;
      }
    }

    return next;
  });
}

/**
 * События починки с листа ремонтов — в ленту утечки.
 *
 * Лист ремонтов — единственное место в книге, где починки записаны все: в
 * колонках листа утечек их только одна, последняя. Без этого разбора книга без
 * служебного листа теряла историю починок целиком, и утечка, которую чинили
 * трижды, возвращалась из Excel нечиненой.
 *
 * События, уже стоящие в ленте под тем же номером, не удваиваются: номер
 * выводится из бирки, вида события и его момента.
 */
export function attachRepairEvents(leaks, eventsByLeakId) {
  if (!eventsByLeakId.size) return leaks;
  const normalizedEvents = normalizeRecordMap(eventsByLeakId);

  return leaks.map((leak) => {
    const events = normalizedEvents.get(normalizeLeakTag(leak.leak_id));
    if (!events?.length) return leak;

    // Лента достраивается со старых полей только у записи, у которой её нет
    // вовсе, — и, дописав починки, мы бы эту достройку отключили: утечка
    // теряла бы событие обнаружения и осмотры. Поэтому сначала общая
    // доменная достройка, а починки уже поверх неё.
    const base = Array.isArray(leak.events) ? leak : migrateLeakEvents(leak);
    const byId = new Map(
      [...(Array.isArray(base.events) ? base.events : []), ...events].map(
        (event) => [String(event?.id), event],
      ),
    );

    return {
      ...leak,
      events: [...byId.values()].sort(
        (left, right) => Date.parse(left?.date) - Date.parse(right?.date),
      ),
      updatedAt: Math.max(
        Number(leak.updatedAt) || 0,
        ...events.map((event) => Date.parse(event.date) || 0),
      ),
    };
  });
}

export function attachHistoryRecords(leaks, recordsByLeakId) {
  if (!recordsByLeakId.size) return leaks;
  const normalizedRecords = normalizeRecordMap(recordsByLeakId);

  return leaks.map((leak) => {
    const records = normalizedRecords.get(normalizeLeakTag(leak.leak_id));
    if (!records?.length) return leak;
    const fallbackUser = leak.detectedBy || leak.monitoredBy || "Не указан";
    const importedHistory = records.map((record) => ({
      ...record,
      user: record.user || fallbackUser,
    }));

    return {
      ...leak,
      history: mergeHistoryRecords(leak.history, importedHistory),
      updatedAt: Math.max(
        Number(leak.updatedAt) || 0,
        ...records.map((record) => Date.parse(record.date) || 0),
      ),
    };
  });
}
