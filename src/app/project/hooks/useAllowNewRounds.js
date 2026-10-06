import { useCallback, useEffect, useState } from "react";
import {
  PROJECT_SETTINGS_UPDATED_EVENT,
  readAllowFinishRounds,
  readAllowNewRounds,
  writeAllowFinishRounds,
  writeAllowNewRounds,
} from "@/app/project/projectSettings";

/**
 * Настройка обходов проекта. Читается заново, когда настройки проекта
 * меняются — переключатель в настройках и экран обхода видят одно и то же.
 *
 * @param {string|null} projectId
 * @param {(projectId: string|null) => boolean} read
 * @param {(projectId: string|null, allow: boolean) => void} write
 * @returns {[boolean, (allow: boolean) => void]}
 */
function useRoundSetting(projectId, read, write) {
  const [allow, setAllow] = useState(() => read(projectId));

  useEffect(() => {
    setAllow(read(projectId));
    if (!projectId || typeof window === "undefined") return undefined;
    const handle = (event) => {
      if (event.detail?.projectId === projectId) {
        setAllow(read(projectId));
      }
    };
    window.addEventListener(PROJECT_SETTINGS_UPDATED_EVENT, handle);
    return () =>
      window.removeEventListener(PROJECT_SETTINGS_UPDATED_EVENT, handle);
  }, [projectId, read]);

  const update = useCallback(
    (next) => {
      write(projectId, Boolean(next));
      setAllow(Boolean(next));
    },
    [projectId, write],
  );

  return [allow, update];
}

/** Можно ли заводить новые обходы мониторинга (настройка проекта). */
export function useAllowNewRounds(projectId) {
  return useRoundSetting(projectId, readAllowNewRounds, writeAllowNewRounds);
}

/** Можно ли завершать обходы мониторинга (настройка проекта). */
export function useAllowFinishRounds(projectId) {
  return useRoundSetting(
    projectId,
    readAllowFinishRounds,
    writeAllowFinishRounds,
  );
}
