import { useEffect } from "react";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { STORAGE_KEY, PHOTOS_DIR } from "./constants";

export function useAppStorage(setData) {
  // load localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      setData(JSON.parse(saved));
    } catch (e) {
      console.error("Ошибка чтения localStorage", e);
    }
  }, [setData]);

  // create FS directory
  useEffect(() => {
    Filesystem.mkdir({
      path: PHOTOS_DIR,
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => {});
  }, []);

  const clearDatabase = () => {
    if (!window.confirm("Удалить ВСЮ базу данных?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setData([]);
  };

  return { clearDatabase };
}
