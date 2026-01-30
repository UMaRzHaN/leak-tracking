import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { STORAGE_KEYS } from "../settings/storageKeys";

/* =========================
   HELPERS — WEB
========================= */
const readWeb = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeWeb = (key, data) => {
  localStorage.setItem(key, JSON.stringify(data));
};

/* =========================
   HELPERS — MOBILE
========================= */
const ensureDir = async (filePath) => {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));

  await Filesystem.mkdir({
    path: dir,
    directory: Directory.Documents,
    recursive: true,
  }).catch(() => {
    // mkdir может падать, если директория уже существует — это нормально
  });
};

const readMobile = async (filePath) => {
  try {
    const res = await Filesystem.readFile({
      path: filePath,
      directory: Directory.Documents,
      encoding: "utf8",
    });

    return JSON.parse(res.data || "[]");
  } catch {
    return [];
  }
};

const writeMobile = async (data, filePath) => {
  await ensureDir(filePath);

  await Filesystem.writeFile({
    path: filePath,
    directory: Directory.Documents,
    data: JSON.stringify(data),
    encoding: "utf8",
  });
};

/* =========================
   HOOK
========================= */
export function useProjectData(projectId) {
  if (!projectId) {
    throw new Error("useProjectData: projectId is required");
  }

  const storageKey = STORAGE_KEYS.PROJECT_DATA(projectId);
  const filePath = `LeakReports/${projectId}/data/${projectId}.json`;

  const [data, setData] = useState([]);

  /* =========================
     LOAD ON PROJECT CHANGE
  ========================= */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const loaded = Capacitor.isNativePlatform()
        ? await readMobile(filePath)
        : readWeb(storageKey);

      if (!cancelled) {
        setData(Array.isArray(loaded) ? loaded : []);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [filePath, storageKey]);

  /* =========================
     SAVE
  ========================= */
  const save = useCallback(
    async (next) => {
      setData(() => next);

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

    if (Capacitor.isNativePlatform()) {
      await writeMobile([], filePath);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [filePath, storageKey]);

  return {
    data,
    setData, // оставляем осознанно, для редких кейсов
    save,
    clear,
  };
}
