import { useCallback, useMemo } from "react";
import { STORAGE_KEYS } from "./storageKeys";
import { VAR_DEFAULTS } from "../../data/variables";

const defaultVars = VAR_DEFAULTS;

/**
 * Параметры расчёта для конкретного проекта.
 * @param {string} projectId — project.id (не тип!)
 */
export function useProjectVars(projectId, defaults = defaultVars) {
  // ✅ Все hooks вызываются безусловно
  const storageKey = useMemo(
    () => (projectId ? STORAGE_KEYS.PROJECT_VARS(projectId) : null),
    [projectId]
  );

  const vars = useMemo(() => {
    if (!projectId || !storageKey) {
      return defaults;
    }

    try {
      const raw = localStorage.getItem(storageKey);

      // Пробуем также legacy-ключ (settings) для обратной совместимости
      if (!raw) {
        const legacyKey = STORAGE_KEYS._LEGACY_PROJECT_SETTINGS?.(projectId);
        const legacyRaw = legacyKey ? localStorage.getItem(legacyKey) : null;
        return legacyRaw ? { ...defaults, ...JSON.parse(legacyRaw) } : defaults;
      }

      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  }, [projectId, storageKey, defaults]);

  const setVars = useCallback(
    (nextVars) => {
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(nextVars));
      }
    },
    [storageKey]
  );

  const resetVars = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  return { vars, setVars, resetVars };
}
