import { isNative } from "../utils/platform";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { STORAGE_KEYS } from "../app/settings/storageKeys";
import { LeakRecordSchema } from "../services/export/backupSchema";

function filterValidLeaks(arr, source) {
  if (!Array.isArray(arr)) return [];
  const valid = [];
  const invalid = [];
  for (const item of arr) {
    const r = LeakRecordSchema.safeParse(item);
    if (r.success) valid.push(r.data);
    else invalid.push(item?.id ?? "?");
  }
  if (invalid.length) {
    console.warn(
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
          console.error(`[LeakRepository] Failed to read "${path}":`, err);
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
      console.error("[LeakRepository] Corrupted localStorage:", err);
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
    localStorage.setItem(STORAGE_KEYS.PROJECT_DATA(projectId), JSON.stringify(leaks));
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
