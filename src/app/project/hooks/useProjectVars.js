import { useCallback, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { VAR_DEFAULTS } from "@/data/variables";
import { normalizeProjectVarsUnits } from "@/utils/projectVars";
import { markProjectVarsUpdated } from "@/services/sync/projectSyncState";

const defaultVars = VAR_DEFAULTS;

// Экземпляров хука несколько, и каждый держит параметры у себя. Без события
// постоянный экземпляр в App не узнавал о правке из формы утечки, и ZIP-бэкап
// из меню уходил со старыми параметрами при свежей отметке времени — второй
// телефон принимал их за новые.
function announceVarsUpdated(projectId) {
  if (!projectId || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("project-vars-updated", { detail: { projectId } }),
  );
}

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

  const setVarsAsync = useCallback(
    (nextVars) => {
      let syncUpdate = Promise.resolve();
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(nextVars));
        syncUpdate = Promise.resolve(markProjectVarsUpdated(projectId));
      }
      setRevision((r) => r + 1);
      announceVarsUpdated(projectId);
      return syncUpdate;
    },
    [projectId, storageKey],
  );

  const setVars = useCallback(
    (nextVars) => {
      void setVarsAsync(nextVars);
    },
    [setVarsAsync],
  );

  const resetVarsAsync = useCallback(() => {
    let syncUpdate = Promise.resolve();
    if (storageKey) {
      localStorage.removeItem(storageKey);
      syncUpdate = Promise.resolve(markProjectVarsUpdated(projectId));
    }
    setRevision((r) => r + 1);
    announceVarsUpdated(projectId);
    return syncUpdate;
  }, [projectId, storageKey]);

  const resetVars = useCallback(() => {
    void resetVarsAsync();
  }, [resetVarsAsync]);

  return { vars, setVars, setVarsAsync, resetVars, resetVarsAsync };
}
