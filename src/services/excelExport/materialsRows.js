import { getMonitoringRecords } from "@/utils/monitoring";
import { getRepairExportRows } from "./repairRows";

/**
 * «Расход МТР» (8a): строка на каждый раз, когда на утечку что-то поставили.
 *
 * Отдельного учёта расхода у приложения нет — МТР вписывают в ремонт и в
 * осмотр. Лист собирает их из обоих мест в одну ленту по времени, чтобы
 * снабжение видело, что ушло, не перебирая два листа.
 *
 * @param {any[]} orderedLeaks
 */
export function getMaterialsExportRows(orderedLeaks) {
  const rows = [];

  for (const row of getRepairExportRows(orderedLeaks)) {
    const materials = String(row.materials_equipment ?? "").trim();
    if (!materials) continue;
    rows.push({
      index: row.index,
      leak_id: row.leak_id,
      dateRaw: row.resolvedAt || row.repairAt,
      source: "repair",
      materials_equipment: materials,
      user: row.user,
    });
  }

  orderedLeaks.forEach((leak, leakIndex) => {
    for (const record of getMonitoringRecords(leak)) {
      const materials = String(record.materials_equipment ?? "").trim();
      if (!materials) continue;
      rows.push({
        index: leak.index ?? leakIndex + 1,
        leak_id: leak.leak_id ?? "",
        dateRaw: record.date,
        source: "monitoring",
        materials_equipment: materials,
        user: record.monitoredBy ?? "",
      });
    }
  });

  const time = (row) => {
    const value = Date.parse(String(row.dateRaw ?? ""));
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  };
  return rows.sort((left, right) => time(left) - time(right));
}
