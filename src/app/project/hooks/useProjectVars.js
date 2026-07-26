import { useCallback, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { VAR_DEFAULTS } from "@/data/variables";
import { normalizeProjectVarsUnits } from "@/utils/projectVars";
import { markProjectVarsUpdated } from "@/services/projectSyncState";

const defaultVars = VAR_DEFAULTS;

/**
 * Параметры расчёта для конкретного проекта.
 * @param {string} projectId — project.id (не тип!)
 */
export function useProjectVars(projectId, defaults = defaultVars) {
  const storageKey = useMemo(
    () => (projectId ? STORAGE_KEYS.PROJECT_VARS(projectId) : null),
    [projectId],
  );

  // Revision bump mirrors the pattern in useHiddenFields — forces useMemo
  // to re-read localStorage after setVars/resetVars write to it.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const handleExternalUpdate = (event) => {
      if (event.detail?.projectId === projectId) {
        setRevision((value) => value + 1);
      }
    };
    window.addEventListener("project-vars-updated", handleExternalUpdate);
    return () =>
      window.removeEventListener("project-vars-updated", handleExternalUpdate);
  }, [projectId]);

  const vars = useMemo(() => {
    void revision;
    if (!projectId || !storageKey) {
      return defaults;
    }

    try {
      const raw = localStorage.getItem(storageKey);

      if (!raw) {
        const legacyKey = STORAGE_KEYS._LEGACY_PROJECT_SETTINGS?.(projectId);
        const legacyRaw = legacyKey ? localStorage.getItem(legacyKey) : null;
        return legacyRaw
          ? {
              ...defaults,
              ...normalizeProjectVarsUnits(JSON.parse(legacyRaw)),
            }
          : defaults;
      }

      const stored = JSON.parse(raw);
      const normalized = normalizeProjectVarsUnits(stored);
      if (normalized !== stored) {
        localStorage.setItem(storageKey, JSON.stringify(normalized));
      }
      return { ...defaults, ...normalized };
    } catch {
      return defaults;
    }
  }, [projectId, storageKey, defaults, revision]);

  const setVars = useCallback(
    (nextVars) => {
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(nextVars));
        markProjectVarsUpdated(projectId);
      }
      setRevision((r) => r + 1);
    },
    [projectId, storageKey],
  );

  const resetVars = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
      markProjectVarsUpdated(projectId);
    }
    setRevision((r) => r + 1);
  }, [projectId, storageKey]);

  return { vars, setVars, resetVars };
}
