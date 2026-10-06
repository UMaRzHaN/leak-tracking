import { getLeakEvents } from "@/domain/leakEvents";
import { getMonitoringRecords } from "@/utils/monitoring";
import {
  EVENT_PHOTO_FIELDS,
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";
import { getLeakPhotoPath } from "@/services/excelExport/photoIdentity";
import { getRepairExportRows } from "@/services/excelExport/repairRows";
import { getMaterialsExportRows } from "@/services/excelExport/materialsRows";

const isRepairEvent = (event) => String(event?.type ?? "").startsWith("repair");

/**
 * Счётчики разделов экрана экспорта (8a): сколько строк ляжет в каждый лист
 * и сколько снимков у него. Снимки считаются без повторов внутри раздела —
 * как их положит архив.
 *
 * @param {any[]} leaks
 */
export function countExportSections(leaks) {
  const leakPhotos = new Set();
  const repairPhotos = new Set();
  const monitoringPhotos = new Set();
  let monitoring = 0;

  for (const leak of leaks) {
    for (const key of LEAK_PHOTO_FIELDS) {
      const path = getLeakPhotoPath(leak, key);
      if (path) leakPhotos.add(String(path));
    }
    const records = getMonitoringRecords(leak);
    monitoring += records.length;
    for (const record of records) {
      for (const key of MONITORING_PHOTO_FIELDS) {
        if (record?.[key]) monitoringPhotos.add(String(record[key]));
      }
    }
    for (const event of getLeakEvents(leak)) {
      if (!isRepairEvent(event)) continue;
      for (const key of EVENT_PHOTO_FIELDS) {
        if (event?.[key]) repairPhotos.add(String(event[key]));
      }
    }
  }

  return {
    leaks: { rows: leaks.length, photos: leakPhotos.size },
    repairs: {
      rows: getRepairExportRows(leaks).length,
      photos: repairPhotos.size,
    },
    monitoring: { rows: monitoring, photos: monitoringPhotos.size },
    materials: { rows: getMaterialsExportRows(leaks).length, photos: 0 },
  };
}
