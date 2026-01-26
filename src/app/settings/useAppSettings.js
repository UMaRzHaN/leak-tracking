// src/app/useAppSettings.js
import { useState } from "react";
import { STORAGE_KEYS } from "./storageKeys";

const DEFAULT_PROJECT = "compression";

export function useAppSettings() {
  const [project, setProject] = useState(
    localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT) || DEFAULT_PROJECT
  );

  const changeProject = (id) => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT, id);
    setProject(id);
  };

  return {
    project,
    changeProject,
  };
}
