import { useState, useCallback, useEffect, useMemo } from "react";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import {
  PROJECT_SETTINGS_UPDATED_EVENT,
  touchProjectSettings,
} from "@/app/project/projectSettings";

function readFromStorage(key) {
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Per-project hidden fields list.
 * Returns a Set of field keys that the user has chosen to hide.
 * Uses a revision counter so that setHiddenFields triggers a synchronous re-read.
 */
export function useHiddenFields(projectId) {
  const storageKey = useMemo(
    () => (projectId ? STORAGE_KEYS.PROJECT_HIDDEN_FIELDS(projectId) : null),
    [projectId],
  );

  // revision bump forces useMemo to re-read localStorage
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!projectId || typeof window === "undefined") return undefined;
    const handleSettingsUpdated = (event) => {
      if (event.detail?.projectId === projectId) {
        setRevision((value) => value + 1);
      }
    };
    window.addEventListener(
      PROJECT_SETTINGS_UPDATED_EVENT,
      handleSettingsUpdated,
    );
    return () =>
      window.removeEventListener(
        PROJECT_SETTINGS_UPDATED_EVENT,
        handleSettingsUpdated,
      );
  }, [projectId]);

  const hiddenFields = useMemo(
    () => readFromStorage(storageKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey, revision],
  );

  const setHiddenFields = useCallback(
    (fields) => {
      const set = fields instanceof Set ? fields : new Set(fields);
      if (storageKey) {
        if (set.size === 0) {
          localStorage.removeItem(storageKey);
        } else {
          localStorage.setItem(storageKey, JSON.stringify([...set]));
        }
        touchProjectSettings(projectId);
      }
      setRevision((r) => r + 1);
    },
    [projectId, storageKey],
  );

  return { hiddenFields, setHiddenFields };
}
