import { useState, useCallback, useEffect, useMemo } from "react";
import {
  PROJECT_SETTINGS_UPDATED_EVENT,
  touchProjectSettings,
} from "@/app/project/projectSettings";
import {
  HIDDEN_FIELD_SCOPES,
  hiddenFieldsStorageKey,
  readHiddenFields,
} from "@/app/project/hiddenFieldsStorage";

/**
 * Per-project hidden fields list.
 * Returns a Set of field keys that the user has chosen to hide.
 * Uses a revision counter so that setHiddenFields triggers a synchronous re-read.
 *
 * `scope` разделяет два независимых списка: поля утечки и поля карточки
 * компонента. Имена у них пересекаются, и общий список скрывал бы поле разом
 * на обоих экранах.
 */
export function useHiddenFields(projectId, scope = HIDDEN_FIELD_SCOPES.LEAKS) {
  const storageKey = useMemo(
    () => hiddenFieldsStorageKey(projectId, scope),
    [projectId, scope],
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

  const hiddenFields = useMemo(() => {
    void revision;
    return readHiddenFields(projectId, scope);
  }, [projectId, scope, revision]);

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
