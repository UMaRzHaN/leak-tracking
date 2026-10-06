import { useCallback, useEffect, useState } from "react";
import {
  PROJECT_SETTINGS_UPDATED_EVENT,
  readAllowNewRounds,
  writeAllowNewRounds,
} from "@/app/project/projectSettings";

/**
 * Можно ли заводить новые обходы мониторинга (настройка проекта). Читается
 * заново, когда настройки проекта меняются — переключатель в настройках и
 * экран обхода видят одно и то же.
 *
 * @param {string|null} projectId
 * @returns {[boolean, (allow: boolean) => void]}
 */
export function useAllowNewRounds(projectId) {
  const [allow, setAllow] = useState(() => readAllowNewRounds(projectId));

  useEffect(() => {
    setAllow(readAllowNewRounds(projectId));
    if (!projectId || typeof window === "undefined") return undefined;
    const handle = (event) => {
      if (event.detail?.projectId === projectId) {
        setAllow(readAllowNewRounds(projectId));
      }
    };
    window.addEventListener(PROJECT_SETTINGS_UPDATED_EVENT, handle);
    return () =>
      window.removeEventListener(PROJECT_SETTINGS_UPDATED_EVENT, handle);
  }, [projectId]);

  const update = useCallback(
    (next) => {
      writeAllowNewRounds(projectId, Boolean(next));
      setAllow(Boolean(next));
    },
    [projectId],
  );

  return [allow, update];
}
