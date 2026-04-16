import { useCallback } from "react";
import { STORAGE_KEYS } from "./storageKeys";
import { VAR_DEFAULTS } from "../../data/variables";

const defaultVars = VAR_DEFAULTS;

/**
 * Параметры расчёта для конкретного проекта.
 * @param {string} projectId — project.id (не тип!)
 */
export function useProjectVars(projectId, defaults = defaultVars) {
  if (!projectId) {
    // Нет активного проекта — возвращаем дефолты без сохранения
    return {
      vars: defaults,
      setVars: () => {},
      resetVars: () => {},
    };
  }

  const storageKey = STORAGE_KEYS.PROJECT_VARS(projectId);

  const vars = (() => {
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
  })();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const setVars = useCallback(
    (nextVars) => { localStorage.setItem(storageKey, JSON.stringify(nextVars)); },
    [storageKey],
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const resetVars = useCallback(
    () => { localStorage.removeItem(storageKey); },
    [storageKey],
  );

  return { vars, setVars, resetVars };
}
