import { getPhotoSrc } from "@/hooks/photoService";

const PHOTO_FIELDS = ["photo", "photo_after"];

function hasCoords(leak) {
  return (
    Number.isFinite(Number(leak?.lat)) && Number.isFinite(Number(leak?.lng))
  );
}

function getLeakLabel(leak) {
  return String(leak?.leak_id ?? leak?.id ?? "?");
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
  { idbGetPhoto } = {},
) {
  const missingPhoto = [];
  const brokenPhoto = [];
  const missingCoords = [];
  const duplicateLeakIds = [];
  const seenLeakIds = new Map();

  for (const leak of leaks) {
    const label = getLeakLabel(leak);

    if (!hasCoords(leak)) missingCoords.push(label);

    const leakTag = leak?.leak_id == null ? "" : String(leak.leak_id).trim();
    if (leakTag) {
      if (seenLeakIds.has(leakTag)) {
        duplicateLeakIds.push(leakTag);
      } else {
        seenLeakIds.set(leakTag, leak);
      }
    }

    if (!leak?.photo) {
      missingPhoto.push(label);
    }

    for (const field of PHOTO_FIELDS) {
      const path = leak?.[field];
      if (!path) continue;
      if (!(await photoExists(path, idbGetPhoto))) {
        brokenPhoto.push(`${label}:${field}`);
      }
    }
  }

  const issues =
    missingPhoto.length +
    brokenPhoto.length +
    missingCoords.length +
    duplicateLeakIds.length;

  return {
    total: leaks.length,
    issues,
    missingPhoto,
    brokenPhoto,
    missingCoords,
    duplicateLeakIds,
    ok: issues === 0,
  };
}
