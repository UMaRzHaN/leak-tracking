import { useCallback } from "react";
import { logger } from "@/utils/logger";

const DRAFT_KEY = "app:form_draft_v1";
const TTL = 86_400_000; // 24 часа

function removeStoredDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

function readValidDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
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
    !validForm ||
    expired
  ) {
    removeStoredDraft();
    return null;
  }

  return parsed;
}

export function useFormDraft() {
  /* ======================================================
     SAVE
     ====================================================== */
  const saveDraft = useCallback((form, step) => {
    try {
      if (!form || typeof form !== "object") return;

      const { photo, ...rest } = form;
      const photoPayload =
        photo && typeof photo === "object" && typeof photo.src === "string"
          ? { photo: { src: photo.src } }
          : {};

      const payload = {
        form: { ...rest, ...photoPayload },
        step,
        savedAt: Date.now(),
      };

      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch (e) {
      logger.warn("Draft save failed:", e);
    }
  }, []);

  /* ======================================================
     LOAD
     ====================================================== */
  const loadDraft = useCallback(() => {
    try {
      const parsed = readValidDraft();
      if (!parsed) return null;
      const { form, step } = parsed;

      return { form: form ?? {}, step: step ?? 1 };
    } catch (e) {
      logger.warn("Draft load failed:", e);
      removeStoredDraft();
      return null;
    }
  }, []);

  /* ======================================================
     CLEAR
     ====================================================== */
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (e) {
      logger.warn("Draft clear failed:", e);
    }
  }, []);

  /* ======================================================
     HAS DRAFT
     ====================================================== */
  const hasDraft = useCallback(() => {
    try {
      return Boolean(readValidDraft());
    } catch {
      removeStoredDraft();
      return false;
    }
  }, []);

  return {
    saveDraft,
    loadDraft,
    clearDraft,
    hasDraft,
  };
}
