import { collectLeakPhotoPaths } from "@/domain/leakLifecycle";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";
import { MONITORING_RESULT, isMonitoringDue } from "@/utils/monitoring";
import { STATUS } from "@/utils/status";

export const MONITORING_FILTER = {
  DUE: "due",
  CHECKED: "checked",
  ALL: "all",
};

const STATUS_TO_MONITORING_RESULT = {
  [STATUS.OPEN]: MONITORING_RESULT.STILL_LEAKING,
  [STATUS.IN_PROGRESS]: MONITORING_RESULT.NEEDS_RECHECK,
  [STATUS.RESOLVED]: MONITORING_RESULT.RESOLVED,
};

export function formatRoundPeriod(startedAt, completedAt, lang) {
  const started = new Date(startedAt);
  if (!Number.isFinite(started.getTime())) return "";
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  const date = started.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const formatTime = (value) =>
    new Date(value).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${date}, ${formatTime(startedAt)}${
    completedAt ? `–${formatTime(completedAt)}` : ""
  }`;
}

export function getCurrentMonitoringResult(leak) {
  return STATUS_TO_MONITORING_RESULT[leak?.status ?? STATUS.OPEN];
}

export function getInitialMonitoringResult(leak) {
  return getCurrentMonitoringResult(leak) ?? MONITORING_RESULT.STILL_LEAKING;
}

export function createMonitoringDraft(leak, current = {}) {
  return {
    result: getInitialMonitoringResult(leak),
    comment: "",
    materials_equipment: leak?.materials_equipment ?? "",
    photo: null,
    ...current,
  };
}

export function getMonitoringRoundSummary(data, roundId, roundNumber) {
  const leaks = Array.isArray(data) ? data : [];
  const due = roundId
    ? leaks.filter((leak) => isMonitoringDue(leak, roundId, roundNumber)).length
    : leaks.length;

  return {
    total: leaks.length,
    due,
    checked: Math.max(0, leaks.length - due),
    open: leaks.filter((leak) => (leak.status ?? STATUS.OPEN) === STATUS.OPEN)
      .length,
    inProgress: leaks.filter((leak) => leak.status === STATUS.IN_PROGRESS)
      .length,
    resolved: leaks.filter((leak) => leak.status === STATUS.RESOLVED).length,
  };
}

export function getNextMonitoringRoundNumber(data, currentRoundNumber) {
  const maxRecordNumber = (Array.isArray(data) ? data : []).reduce(
    (max, leak) => {
      const records = Array.isArray(leak.monitoringRecords)
        ? leak.monitoringRecords
        : [];
      return records.reduce((recordMax, record) => {
        const value = Number(record?.roundNumber);
        return Number.isFinite(value) && value > recordMax ? value : recordMax;
      }, max);
    },
    0,
  );

  return Math.max(Number(currentRoundNumber) || 0, maxRecordNumber) + 1;
}

function sortMonitoringItems(items, roundId, roundNumber) {
  return [...items].sort((left, right) => {
    const leftDue =
      Boolean(roundId) && isMonitoringDue(left, roundId, roundNumber);
    const rightDue =
      Boolean(roundId) && isMonitoringDue(right, roundId, roundNumber);
    if (leftDue !== rightDue) return leftDue ? -1 : 1;
    return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
  });
}

export function getMonitoringItems(displayed, filter, roundId, roundNumber) {
  const sorted = sortMonitoringItems(
    Array.isArray(displayed) ? displayed : [],
    roundId,
    roundNumber,
  );
  if (!roundId || filter === MONITORING_FILTER.ALL) return sorted;

  const shouldBeDue = filter === MONITORING_FILTER.DUE;
  return sorted.filter(
    (leak) => isMonitoringDue(leak, roundId, roundNumber) === shouldBeDue,
  );
}

export function getMonitoringCounts(displayed, roundId, roundNumber) {
  const items = Array.isArray(displayed) ? displayed : [];
  if (!roundId) return { due: 0, checked: 0, all: items.length };

  const due = items.filter((leak) =>
    isMonitoringDue(leak, roundId, roundNumber),
  ).length;
  return { due, checked: items.length - due, all: items.length };
}

export function getMonitoringPhotoPathsToKeep(leak) {
  return collectLeakPhotoPaths(leak);
}

export function buildMonitoringPatch({
  leak,
  draft,
  monitoredBy,
  photoPath,
  roundId,
  roundNumber,
  now = new Date(),
}) {
  const result = draft.result || MONITORING_RESULT.STILL_LEAKING;
  const materialsEquipment = draft.materials_equipment?.trim() || undefined;
  const previousMaterialsEquipment =
    leak.materials_equipment?.trim() || undefined;
  const materialsChanged = materialsEquipment !== previousMaterialsEquipment;
  const record = {
    id: `${leak.id}-${now.getTime()}`,
    date: now.toISOString(),
    roundId,
    roundNumber,
    monitoredBy: monitoredBy.trim(),
    result,
    photo: photoPath,
    ...(materialsChanged
      ? {
          materials_equipment: materialsEquipment ?? null,
          materialsChanged: true,
        }
      : {}),
    comment: draft.comment?.trim() || undefined,
  };

  const nextStatus =
    result === MONITORING_RESULT.RESOLVED
      ? STATUS.RESOLVED
      : result === MONITORING_RESULT.NEEDS_RECHECK
        ? STATUS.IN_PROGRESS
        : STATUS.OPEN;
  const statusPatch =
    nextStatus === STATUS.RESOLVED
      ? {
          status: nextStatus,
          resolvedAt: now.getTime(),
          photo_after: photoPath ?? leak.photo_after,
        }
      : {
          status: nextStatus,
          resolvedAt: null,
          ...(nextStatus === STATUS.IN_PROGRESS
            ? {
                repairAt: now.getTime(),
                photo_repair: photoPath ?? leak.photo_repair,
              }
            : {}),
        };
  const nextLeakForChanges = {
    ...leak,
    ...statusPatch,
    materials_equipment: materialsEquipment,
  };
  const changes = buildLeakHistoryChanges({
    before: leak,
    after: nextLeakForChanges,
    fields: [{ key: "materials_equipment" }],
  });

  return {
    ...leak,
    ...statusPatch,
    materials_equipment: materialsEquipment,
    updatedAt: now.getTime(),
    monitoringRecords: [...(leak.monitoringRecords ?? []), record],
    history: [
      ...(leak.history ?? []),
      {
        action: "monitoring",
        date: record.date,
        to: nextStatus,
        user: record.monitoredBy || undefined,
        ...(record.comment ? { text: record.comment } : {}),
        ...(changes.length > 0 ? { changes } : {}),
      },
    ],
  };
}
