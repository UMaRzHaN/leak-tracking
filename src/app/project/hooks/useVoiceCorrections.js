import { useCallback, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import {
  PROJECT_SETTINGS_UPDATED_EVENT,
  touchProjectSettings,
} from "@/app/project/projectSettings";
import { normalizeVoiceCorrections } from "@/features/voice/utils/voiceCorrections";

function readJson(key) {
  if (!key) return null;
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

/**
 * Поправки к распознанной речи, заведённые на этом проекте.
 *
 * Читаются тем же способом, что и остальные настройки проекта, — и по тому же
 * событию обновляются: список правят на экране настроек, а пользуется им форма
 * утечки, и без общего сигнала она бы жила со старым до перезапуска.
 *
 * @param {string|null|undefined} projectId
 */
export function useVoiceCorrections(projectId) {
  const key = projectId
    ? STORAGE_KEYS.PROJECT_VOICE_CORRECTIONS(projectId)
    : null;
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

  const corrections = useMemo(() => {
    void revision;
    return normalizeVoiceCorrections(readJson(key));
  }, [key, revision]);

  const save = useCallback(
    (next) => {
      if (!key) return;
      const normalized = normalizeVoiceCorrections(next);
      if (normalized.length) {
        localStorage.setItem(key, JSON.stringify(normalized));
      } else {
        localStorage.removeItem(key);
      }
      touchProjectSettings(projectId);
      setRevision((value) => value + 1);
    },
    [key, projectId],
  );

  return { corrections, saveCorrections: save };
}
