import { isNative } from "@/utils/platform";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { logger } from "@/utils/logger";

const VALID_STATUSES = new Set(["open", "in_progress", "resolved"]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeOptionalNumber(value) {
  if (value == null) return value ?? null;
  return isFiniteNumber(value) ? value : undefined;
}

function isValidPhotoPath(value) {
  return (
    value == null ||
    (typeof value === "string" &&
      (value.startsWith("idb://") ||
        value.startsWith("data://") ||
        value.startsWith("zip:") ||
        value.startsWith("data:image/") ||
        value.startsWith("Documents/")))
  );
}

function normalizeLeakRecord(item) {
  if (!item || typeof item !== "object") return null;
  if (!(typeof item.id === "string" || typeof item.id === "number"))
    return null;

  const lat = normalizeOptionalNumber(item.lat);
  const lng = normalizeOptionalNumber(item.lng);
  if (item.lat != null && lat === undefined) return null;
  if (item.lng != null && lng === undefined) return null;

  const status = item.status ?? "open";
  if (!VALID_STATUSES.has(status)) return null;
  if (
    !isValidPhotoPath(item.photo) ||
    !isValidPhotoPath(item.photo_after) ||
    !isValidPhotoPath(item.photo_repair)
  ) {
    return null;
  }

  return {
    ...item,
    lat,
    lng,
    status,
  };
}

function filterValidLeaks(arr, source) {
  if (!Array.isArray(arr)) return [];
  const valid = [];
  const invalid = [];
  for (const item of arr) {
    const normalized = normalizeLeakRecord(item);
    if (normalized) valid.push(normalized);
    else invalid.push(item?.id ?? "?");
  }
  if (invalid.length) {
    logger.warn(
      `[LeakRepository] ${source}: discarded ${invalid.length} invalid records (id: ${invalid.join(", ")})`,
    );
  }
  return valid;
}

function getMobilePath(folderName) {
  return `LeakReports/${folderName}/data/data.json`;
}

async function ensureDir(filePath) {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  await Filesystem.mkdir({
    path: dir,
    directory: Directory.Data,
    recursive: true,
  }).catch(() => {});
}

export const LeakRepository = {
  async getAll({ projectId, folderName }) {
    if (isNative) {
      const path = getMobilePath(folderName);
      try {
        const res = await Filesystem.readFile({
          path,
          directory: Directory.Data,
          encoding: "utf8",
        });
        return filterValidLeaks(JSON.parse(res.data || "[]"), path);
      } catch (err) {
        if (!String(err?.message).toLowerCase().includes("exist")) {
          logger.error(`[LeakRepository] Failed to read "${path}":`, err);
        }
        return [];
      }
    }

    try {
      const key = STORAGE_KEYS.PROJECT_DATA(projectId);
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      return filterValidLeaks(JSON.parse(raw), `localStorage[${key}]`);
    } catch (err) {
      logger.error("[LeakRepository] Corrupted localStorage:", err);
      return [];
    }
  },

  async saveAll(leaks, { projectId, folderName }) {
    if (isNative) {
      const path = getMobilePath(folderName);
      await ensureDir(path);
      await Filesystem.writeFile({
        path,
        directory: Directory.Data,
        data: JSON.stringify(leaks),
        encoding: "utf8",
      });
      return;
    }
    localStorage.setItem(
      STORAGE_KEYS.PROJECT_DATA(projectId),
      JSON.stringify(leaks),
    );
  },

  async clear({ projectId, folderName }) {
    if (isNative) {
      const path = getMobilePath(folderName);
      await ensureDir(path);
      await Filesystem.writeFile({
        path,
        directory: Directory.Data,
        data: "[]",
        encoding: "utf8",
      });
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.PROJECT_DATA(projectId));
  },
};
