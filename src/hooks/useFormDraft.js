import { useCallback } from "react";
import { logger } from "@/utils/logger";

const LEGACY_DRAFT_KEY = "app:form_draft_v1";
const TTL = 86_400_000; // 24 часа

function draftKey(projectId) {
  const normalized = String(projectId ?? "").trim();
  return normalized ? `app:${normalized}:form_draft_v2` : null;
}

function removeStoredDraft(key) {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

function readValidDraft(key, projectId) {
  if (!key) return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  const parsed = JSON.parse(raw);
  const savedAt = Number(parsed?.savedAt);
  const validForm =
    parsed?.form == null ||
    (typeof parsed.form === "object" && !Array.isArray(parsed.form));
  const expired = !Number.isFinite(savedAt) || Date.now() - savedAt > TTL;

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    parsed.projectId !== projectId ||
    !validForm ||
    expired
  ) {
    removeStoredDraft(key);
    return null;
  }

  return parsed;
}

function migrateLegacyDraft(key, projectId) {
  if (!key) return null;
  const raw = localStorage.getItem(LEGACY_DRAFT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt);
    const validForm =
      parsed?.form != null &&
      typeof parsed.form === "object" &&
      !Array.isArray(parsed.form);
    const expired = !Number.isFinite(savedAt) || Date.now() - savedAt > TTL;
    if (!validForm || expired) {
      localStorage.removeItem(LEGACY_DRAFT_KEY);
      return null;
    }

    const migrated = { ...parsed, projectId };
    localStorage.setItem(key, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_DRAFT_KEY);
    return migrated;
  } catch {
    localStorage.removeItem(LEGACY_DRAFT_KEY);
    return null;
  }
}

export function useFormDraft(projectId) {
  const normalizedProjectId = String(projectId ?? "").trim() || null;
  const key = draftKey(normalizedProjectId);
  /* ======================================================
     SAVE
     ====================================================== */
  const saveDraft = useCallback(
    (form, step) => {
      try {
        if (!form || typeof form !== "object") return;

        const { photo, ...rest } = form;
        const photoPayload =
          photo && typeof photo === "object" && typeof photo.src === "string"
            ? { photo: { src: photo.src } }
            : {};

        const payload = {
          projectId: normalizedProjectId,
          form: { ...rest, ...photoPayload },
          step,
          savedAt: Date.now(),
        };

        if (!key) return;
        localStorage.setItem(key, JSON.stringify(payload));
        localStorage.removeItem(LEGACY_DRAFT_KEY);
      } catch (e) {
        logger.warn("Draft save failed:", e);
      }
    },
    [key, normalizedProjectId],
  );

  /* ======================================================
     LOAD
     ====================================================== */
  const loadDraft = useCallback(() => {
    try {
      const parsed =
        readValidDraft(key, normalizedProjectId) ??
        migrateLegacyDraft(key, normalizedProjectId);
      if (!parsed) return null;
      const { form, step } = parsed;

      return { form: form ?? {}, step: step ?? 1 };
    } catch (e) {
      logger.warn("Draft load failed:", e);
      removeStoredDraft(key);
      return null;
    }
  }, [key, normalizedProjectId]);

  /* ======================================================
     CLEAR
     ====================================================== */
  const clearDraft = useCallback(() => {
    try {
      removeStoredDraft(key);
      localStorage.removeItem(LEGACY_DRAFT_KEY);
    } catch (e) {
      logger.warn("Draft clear failed:", e);
    }
  }, [key]);

  /* ======================================================
     HAS DRAFT
     ====================================================== */
  const hasDraft = useCallback(() => {
    try {
      return Boolean(
        readValidDraft(key, normalizedProjectId) ??
        migrateLegacyDraft(key, normalizedProjectId),
      );
    } catch {
      removeStoredDraft(key);
      return false;
    }
  }, [key, normalizedProjectId]);

  return {
    saveDraft,
    loadDraft,
    clearDraft,
    hasDraft,
  };
}
