import { useCallback, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { VAR_DEFAULTS } from "@/data/variables";

const defaultVars = VAR_DEFAULTS;

/**
 * Параметры расчёта для конкретного проекта.
 * @param {string} projectId — project.id (не тип!)
 */
export function useProjectVars(projectId, defaults = defaultVars) {
  const storageKey = useMemo(
    () => (projectId ? STORAGE_KEYS.PROJECT_VARS(projectId) : null),
    [projectId]
  );

  // Revision bump mirrors the pattern in useHiddenFields — forces useMemo
  // to re-read localStorage after setVars/resetVars write to it.
  const [revision, setRevision] = useState(0);

  const vars = useMemo(() => {
    if (!projectId || !storageKey) {
      return defaults;
    }

    try {
      const raw = localStorage.getItem(storageKey);

      if (!raw) {
        const legacyKey = STORAGE_KEYS._LEGACY_PROJECT_SETTINGS?.(projectId);
        const legacyRaw = legacyKey ? localStorage.getItem(legacyKey) : null;
        return legacyRaw ? { ...defaults, ...JSON.parse(legacyRaw) } : defaults;
      }

      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, storageKey, defaults, revision]);

  const setVars = useCallback(
    (nextVars) => {
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(nextVars));
      }
      setRevision((r) => r + 1);
    },
    [storageKey]
  );

  const resetVars = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
    setRevision((r) => r + 1);
  }, [storageKey]);

  return { vars, setVars, resetVars };
}
