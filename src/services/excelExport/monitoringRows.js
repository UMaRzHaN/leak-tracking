import { getMonitoringRecords } from "@/utils/monitoring";
import { EXCEL_MONITORING_EXPORT_MODE } from "@/utils/excelExportMode";

export function buildMonitoringRoundLookup(orderedLeaks) {
  const rounds = new Map();

  orderedLeaks.forEach((leak) => {
    getMonitoringRecords(leak).forEach((record) => {
      if (!record.roundId || Number(record.roundNumber) > 0) return;

      const time = Date.parse(record.date);
      const current = rounds.get(record.roundId);
      if (!current || time < current.firstTime) {
        rounds.set(record.roundId, {
          firstTime: Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time,
        });
      }
    });
  });

  return new Map(
    [...rounds.entries()]
      .sort((left, right) => left[1].firstTime - right[1].firstTime)
      .map(([roundId], index) => [roundId, index + 1]),
  );
}

export function getMonitoringExportRows(
  orderedLeaks,
  roundLookup,
  monitoringExportMode = EXCEL_MONITORING_EXPORT_MODE.FULL,
) {
  const rows = [];

  orderedLeaks.forEach((leak, leakIndex) => {
    getMonitoringRecords(leak).forEach((record, recordIndex) => {
      const roundNumber =
        Number(record.roundNumber) > 0
          ? Number(record.roundNumber)
          : (roundLookup.get(record.roundId) ?? recordIndex + 1);
      const roundKey = record.roundId ?? `legacy-${roundNumber}`;
      rows.push({
        index: leak.index ?? leakIndex + 1,
        leak_id: leak.leak_id ?? "",
        roundNumber,
        dateRaw: record.date,
        monitoredBy: record.monitoredBy ?? "",
        result: record.result,
        materials_equipment: record.materials_equipment ?? "",
        comment: record.comment ?? "",
        photo: record.photo ?? "",
        photoMapKey: `monitoring:${leakIndex}:${recordIndex}`,
        exportGroupKey: `${leak.id ?? leak.leak_id ?? leakIndex}:${roundKey}`,
      });
    });
  });

  const selectedRows =
    monitoringExportMode === EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND
      ? [
          ...rows
            .reduce((latestByGroup, row) => {
              const current = latestByGroup.get(row.exportGroupKey);
              const currentTime = Date.parse(current?.dateRaw ?? "");
              const rowTime = Date.parse(row.dateRaw);
              if (
                !current ||
                (Number.isNaN(currentTime) ? 0 : currentTime) <=
                  (Number.isNaN(rowTime) ? 0 : rowTime)
              ) {
                latestByGroup.set(row.exportGroupKey, row);
              }
              return latestByGroup;
            }, new Map())
            .values(),
        ]
      : rows;

  return selectedRows.sort((left, right) => {
    if (left.roundNumber !== right.roundNumber) {
      return left.roundNumber - right.roundNumber;
    }

    if ((left.index ?? 0) !== (right.index ?? 0)) {
      return (left.index ?? 0) - (right.index ?? 0);
    }

    const leftTime = Date.parse(left.dateRaw);
    const rightTime = Date.parse(right.dateRaw);
    return (
      (Number.isNaN(leftTime) ? 0 : leftTime) -
      (Number.isNaN(rightTime) ? 0 : rightTime)
    );
  });
}
