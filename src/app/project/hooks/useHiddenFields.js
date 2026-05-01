import { useState, useCallback, useMemo } from "react";
import { STORAGE_KEYS } from "@/app/project/storageKeys";

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
      }
      setRevision((r) => r + 1);
    },
    [storageKey],
  );

  return { hiddenFields, setHiddenFields };
}
