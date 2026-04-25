import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { STORAGE_KEYS } from "../settings/storageKeys";
import { useProject } from "../settings/ProjectContext";

/*
 * Данные хранятся в Directory.Data (приватное).
 * Путь строится из project.id для web-ключа и project.folderName для мобильного пути.
 *
 * Мобильная структура:
 *   LeakReports/{folderName}/data/data.json
 */

/* =========================
   HELPERS — WEB
========================= */
const readWeb = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error(`[useProjectData] Corrupted localStorage data for key "${key}":`, err);
    return [];
  }
};

const writeWeb = (key, data) =>
  localStorage.setItem(key, JSON.stringify(data));

/* =========================
   HELPERS — MOBILE
========================= */
const ensureDir = async (filePath) => {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  await Filesystem.mkdir({
    path: dir,
    directory: Directory.Data,
    recursive: true,
  }).catch(() => {});
};

const readMobile = async (filePath) => {
  try {
    const res = await Filesystem.readFile({
      path: filePath,
      directory: Directory.Data,
      encoding: "utf8",
    });
    return JSON.parse(res.data || "[]");
  } catch (err) {
    // "File does not exist" on first launch is expected; anything else is worth logging
    if (!String(err?.message).toLowerCase().includes("exist")) {
      console.error(`[useProjectData] Failed to read data file "${filePath}":`, err);
    }
    return [];
  }
};

const writeMobile = async (data, filePath) => {
  await ensureDir(filePath);
  await Filesystem.writeFile({
    path: filePath,
    directory: Directory.Data,
    data: JSON.stringify(data),
    encoding: "utf8",
  });
};

/* =========================
   HOOK
========================= */
export function useProjectData() {
  const { activeProject } = useProject();

  // Пока проект не выбран — работаем с пустым массивом
  const storageKey = activeProject
    ? STORAGE_KEYS.PROJECT_DATA(activeProject.id)
    : null;

  const filePath = activeProject
    ? `LeakReports/${activeProject.folderName}/data/data.json`
    : null;

  const [data, setData] = useState([]);

  /* =========================
     LOAD on project change
  ========================= */
  useEffect(() => {
    if (!storageKey && !filePath) {
      setData([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const loaded = Capacitor.isNativePlatform()
        ? await readMobile(filePath)
        : readWeb(storageKey);

      if (!cancelled) setData(Array.isArray(loaded) ? loaded : []);
    };

    load();
    return () => { cancelled = true; };
  }, [storageKey, filePath]);

  /* =========================
     SAVE
  ========================= */
  const save = useCallback(
    async (next) => {
      setData(() => next);
      if (!storageKey && !filePath) return;

      if (Capacitor.isNativePlatform()) {
        await writeMobile(next, filePath);
      } else {
        writeWeb(storageKey, next);
      }
    },
    [filePath, storageKey],
  );

  /* =========================
     CLEAR
  ========================= */
  const clear = useCallback(async () => {
    setData([]);
    if (!storageKey && !filePath) return;

    if (Capacitor.isNativePlatform()) {
      await writeMobile([], filePath);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [filePath, storageKey]);

  return { data, setData, save, clear };
}
