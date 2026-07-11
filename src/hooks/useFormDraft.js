import { useCallback } from "react";
import { logger } from "@/utils/logger";

const DRAFT_KEY = "app:form_draft_v1";
const TTL = 86_400_000; // 24 часа

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
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);

      if (!parsed || typeof parsed !== "object") {
        localStorage.removeItem(DRAFT_KEY);
        return null;
      }

      const { form, step, savedAt } = parsed;

      // ❗ TTL проверка
      if (!savedAt || Date.now() - savedAt > TTL) {
        localStorage.removeItem(DRAFT_KEY);
        return null;
      }

      return { form: form ?? {}, step: step ?? 1 };
    } catch (e) {
      logger.warn("Draft load failed:", e);
      localStorage.removeItem(DRAFT_KEY);
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
      return !!localStorage.getItem(DRAFT_KEY);
    } catch {
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
