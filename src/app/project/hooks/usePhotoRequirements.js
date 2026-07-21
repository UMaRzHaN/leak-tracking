import { useCallback, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import {
  PROJECT_SETTINGS_UPDATED_EVENT,
  touchProjectSettings,
} from "@/app/project/projectSettings";

const DEFAULTS = Object.freeze({
  leakPhotoRequired: true,
  monitoringPhotoRequired: true,
});

function normalizeSettings(value) {
  return {
    leakPhotoRequired:
      typeof value?.leakPhotoRequired === "boolean"
        ? value.leakPhotoRequired
        : DEFAULTS.leakPhotoRequired,
    monitoringPhotoRequired:
      typeof value?.monitoringPhotoRequired === "boolean"
        ? value.monitoringPhotoRequired
        : typeof value?.photoRequired === "boolean"
          ? value.photoRequired
          : DEFAULTS.monitoringPhotoRequired,
  };
}

function readJson(key) {
  if (!key) return null;
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

export function usePhotoRequirements(projectId) {
  const keys = useMemo(
    () =>
      projectId
        ? {
            current: STORAGE_KEYS.PROJECT_PHOTO_REQUIREMENTS(projectId),
            legacy: STORAGE_KEYS.PROJECT_MONITORING_SETTINGS(projectId),
          }
        : { current: null, legacy: null },
    [projectId],
  );
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

  const settings = useMemo(
    () => normalizeSettings(readJson(keys.current) ?? readJson(keys.legacy)),
    // revision forces a synchronous storage re-read after saving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keys, revision],
  );

  const save = useCallback(
    (next) => {
      if (!keys.current) return;
      const normalized = normalizeSettings(next);
      const usesDefaults =
        normalized.leakPhotoRequired === DEFAULTS.leakPhotoRequired &&
        normalized.monitoringPhotoRequired === DEFAULTS.monitoringPhotoRequired;
      if (usesDefaults) localStorage.removeItem(keys.current);
      else localStorage.setItem(keys.current, JSON.stringify(normalized));
      if (keys.legacy) localStorage.removeItem(keys.legacy);
      touchProjectSettings(projectId);
      setRevision((value) => value + 1);
    },
    [keys, projectId],
  );

  const setLeakPhotoRequired = useCallback(
    (required) => save({ ...settings, leakPhotoRequired: Boolean(required) }),
    [save, settings],
  );
  const setMonitoringPhotoRequired = useCallback(
    (required) =>
      save({ ...settings, monitoringPhotoRequired: Boolean(required) }),
    [save, settings],
  );

  return {
    ...settings,
    setLeakPhotoRequired,
    setMonitoringPhotoRequired,
  };
}
