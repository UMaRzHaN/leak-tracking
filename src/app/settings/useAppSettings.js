// src/app/useAppSettings.js
import { useState, useEffect } from "react";
import { STORAGE_KEYS } from "./storageKeys";

const DEFAULT_PROJECT = "compression";

export function useAppSettings() {
  const [project, setProject] = useState(
    localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT) || DEFAULT_PROJECT
  );

  // Слушаем изменения другими экземплярами/окнами
  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT);
      if (saved && saved !== project) {
        setProject(saved);
        console.log(`🔄 Проект изменён на: ${saved}`);
      }
    };

    // Срабатывает при изменении из других вкладок/окон
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [project]);

  const changeProject = (id) => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT, id);
    setProject(id);
    console.log(`✨ Проект изменён на: ${id}`);
  };

  return {
    project,
    changeProject,
  };
}

