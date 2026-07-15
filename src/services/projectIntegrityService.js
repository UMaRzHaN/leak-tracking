import { getPhotoSrc } from "@/hooks/photoService";

const PHOTO_FIELDS = ["photo", "photo_after", "photo_repair"];

function getLeakPhotoRefs(leak) {
  const refs = PHOTO_FIELDS.map((field) => [field, leak?.[field]]);
  if (Array.isArray(leak?.monitoringRecords)) {
    leak.monitoringRecords.forEach((record, index) => {
      refs.push([`monitoringRecords[${index}].photo`, record?.photo]);
    });
  }
  return refs;
}

function hasCoords(leak) {
  return (
    Number.isFinite(Number(leak?.lat)) && Number.isFinite(Number(leak?.lng))
  );
}

function getLeakLabel(leak) {
  return String(leak?.leak_id ?? leak?.id ?? "?");
}

function getLatestMonitoringResult(leak) {
  const records = Array.isArray(leak?.monitoringRecords)
    ? leak.monitoringRecords
    : [];
  if (!records.length) return null;

  return records.reduce((latest, record) => {
    const latestTime = Date.parse(latest?.date ?? "");
    const recordTime = Date.parse(record?.date ?? "");
    if (!Number.isFinite(recordTime)) return latest ?? record;
    if (!Number.isFinite(latestTime) || recordTime >= latestTime) return record;
    return latest;
  }, null)?.result;
}

async function photoExists(path, idbGetPhoto) {
  if (!path) return false;
  if (path.startsWith("data:image/")) return true;

  if (path.startsWith("idb://")) {
    const key = path.replace("idb://", "");
    return Boolean(await idbGetPhoto?.(key));
  }

  return Boolean(await getPhotoSrc(path));
}

export async function analyzeProjectIntegrity(
  leaks = [],
  {
    idbGetPhoto,
    leakPhotoRequired = true,
    monitoringPhotoRequired = true,
  } = {},
) {
  const missingPhoto = [];
  const missingRepairPhoto = [];
  const missingAfterPhoto = [];
  const missingMonitoringPhoto = [];
  const brokenPhoto = [];
  const missingCoords = [];
  const duplicateLeakIds = [];
  const seenLeakIds = new Map();

  for (const leak of leaks) {
    const label = getLeakLabel(leak);
    const latestMonitoringResult = getLatestMonitoringResult(leak);
    const optionalMonitoringRepairPhoto =
      !monitoringPhotoRequired && latestMonitoringResult === "needs_recheck";
    const optionalMonitoringAfterPhoto =
      !monitoringPhotoRequired && latestMonitoringResult === "resolved";

    if (!hasCoords(leak)) missingCoords.push(label);

    const leakTag = leak?.leak_id == null ? "" : String(leak.leak_id).trim();
    if (leakTag) {
      if (seenLeakIds.has(leakTag)) {
        duplicateLeakIds.push(leakTag);
      } else {
        seenLeakIds.set(leakTag, leak);
      }
    }

    if (leakPhotoRequired && !leak?.photo) {
      missingPhoto.push(label);
    }

    if (
      leak?.status === "in_progress" &&
      !leak?.photo_repair &&
      !optionalMonitoringRepairPhoto
    ) {
      missingRepairPhoto.push(label);
    }

    if (
      leak?.status === "resolved" &&
      !leak?.photo_after &&
      !optionalMonitoringAfterPhoto
    ) {
      missingAfterPhoto.push(label);
    }

    if (monitoringPhotoRequired && Array.isArray(leak?.monitoringRecords)) {
      leak.monitoringRecords.forEach((record, index) => {
        if (!record?.photo) {
          missingMonitoringPhoto.push(`${label}:monitoringRecords[${index}]`);
        }
      });
    }

    for (const [field, path] of getLeakPhotoRefs(leak)) {
      if (!path) continue;
      if (!(await photoExists(path, idbGetPhoto))) {
        brokenPhoto.push(`${label}:${field}`);
      }
    }
  }

  const issues =
    missingPhoto.length +
    missingRepairPhoto.length +
    missingAfterPhoto.length +
    missingMonitoringPhoto.length +
    brokenPhoto.length +
    missingCoords.length +
    duplicateLeakIds.length;

  return {
    total: leaks.length,
    issues,
    missingPhoto,
    missingRepairPhoto,
    missingAfterPhoto,
    missingMonitoringPhoto,
    brokenPhoto,
    missingCoords,
    duplicateLeakIds,
    ok: issues === 0,
  };
}
