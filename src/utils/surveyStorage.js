import { useCallback, useEffect, useState } from "react";
import { normalizeSurvey } from "@/domain/surveyGroups";
import { globalScope } from "@/utils/globalScope";

/**
 * «Обследовано без утечек» — JSON проекта, как накладные приёмки: лежит в
 * localStorage по проекту и уходит в project.json бэкапа.
 */
const EVENT = "survey-updated";
const key = (projectId) => (projectId ? `app:${projectId}:survey_v1` : null);

export function readSurvey(projectId) {
  const storageKey = key(projectId);
  if (!storageKey) return normalizeSurvey(null);
  try {
    return normalizeSurvey(
      JSON.parse(localStorage.getItem(storageKey) ?? "null"),
    );
  } catch {
    return normalizeSurvey(null);
  }
}

/** Для бэкапа: `null`, если ничего не вводили. */
export function readStoredSurvey(projectId) {
  const survey = readSurvey(projectId);
  return survey.groups.length ? survey : null;
}

export function saveSurvey(projectId, survey) {
  const storageKey = key(projectId);
  if (!storageKey) return;
  const normalized = normalizeSurvey(survey);
  if (normalized.groups.length) {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ ...normalized, updatedAt: new Date().toISOString() }),
    );
  } else {
    localStorage.removeItem(storageKey);
  }
  globalScope.dispatchEvent?.(
    new CustomEvent(EVENT, { detail: { projectId } }),
  );
}

export function useSurvey(projectId) {
  const [survey, setSurvey] = useState(() => readSurvey(projectId));
  useEffect(() => {
    setSurvey(readSurvey(projectId));
    const handle = (event) => {
      if (event.detail?.projectId === projectId)
        setSurvey(readSurvey(projectId));
    };
    globalScope.addEventListener?.(EVENT, handle);
    return () => globalScope.removeEventListener?.(EVENT, handle);
  }, [projectId]);
  const save = useCallback(
    (next) => {
      saveSurvey(projectId, next);
      setSurvey(readSurvey(projectId));
    },
    [projectId],
  );
  return /** @type {[any, (next: any) => void]} */ ([survey, save]);
}
