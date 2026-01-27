import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { STORAGE_KEYS } from "../settings/storageKeys";

/* =========================
   HELPERS
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

const readMobile = async (file) => {
  try {
    const res = await Filesystem.readFile({
      path: file,
      directory: Directory.Documents,
      encoding: "utf8",
    });
    return JSON.parse(res.data || "[]");
  } catch {
    return [];
  }
};

const writeMobile = async (file, data) => {
  await Filesystem.writeFile({
    path: file,
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
  const fileName = `${projectId}.json`;

  const [data, setData] = useState([]);

  /* =========================
     LOAD ON PROJECT CHANGE
  ========================= */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const loaded = Capacitor.isNativePlatform()
        ? await readMobile(fileName)
        : readWeb(storageKey);

      if (!cancelled) {
        setData(Array.isArray(loaded) ? loaded : []);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, fileName, storageKey]);

  /* =========================
     SAVE
  ========================= */
  const save = useCallback(
    async (next) => {
      setData(next);

      if (Capacitor.isNativePlatform()) {
        await writeMobile(fileName, next);
      } else {
        writeWeb(storageKey, next);
      }
    },
    [fileName, storageKey],
  );

  /* =========================
     CLEAR
  ========================= */
  const clear = useCallback(async () => {
    setData([]);

    if (Capacitor.isNativePlatform()) {
      await writeMobile(fileName, []);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [fileName, storageKey]);

  return {
    data,
    setData, // редко нужен, но оставляем
    save,
    clear,
  };
}
