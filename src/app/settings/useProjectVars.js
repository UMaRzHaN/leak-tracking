import { useCallback } from "react";
import { STORAGE_KEYS } from "./storageKeys";

export function useProjectVars(projectId, defaults) {
  if (!projectId) {
    throw new Error("useProjectVars: projectId is required");
  }

  const storageKey = STORAGE_KEYS.PROJECT_SETTINGS(projectId);

  const vars = (() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    } catch {
      return defaults;
    }
  })();

  const setVars = useCallback(
    (nextVars) => {
      localStorage.setItem(storageKey, JSON.stringify(nextVars));
    },
    [storageKey],
  );

  const resetVars = useCallback(() => {
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { vars, setVars, resetVars };
}
