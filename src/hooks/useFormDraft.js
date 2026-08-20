import { useCallback } from "react";
import { logger } from "@/utils/logger";

const LEGACY_DRAFT_KEY = "app:form_draft_v1";
const TTL = 86_400_000; // 24 часа

/**
 * У каждой формы свой черновик.
 *
 * Утечка и карточка компонента заполняются на одной площадке и обе бросаются
 * на полпути — по звонку, по севшему аккумулятору, по «сначала дойду до конца
 * нитки». Общий ключ означал бы, что начатая карточка стирает начатую утечку.
 *
 * Ключ утечки оставлен прежним: черновики, лежащие на устройствах, должны
 * пережить это изменение.
 */
const DRAFT_SUFFIX = {
  leak: "form_draft_v2",
  component: "component_draft_v1",
};

function draftKey(projectId, kind) {
  const normalized = String(projectId ?? "").trim();
  const suffix = DRAFT_SUFFIX[kind] ?? DRAFT_SUFFIX.leak;
  return normalized ? `app:${normalized}:${suffix}` : null;
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

function migrateLegacyDraft(key, projectId, legacyKey) {
  if (!key || !legacyKey) return null;
  const raw = localStorage.getItem(legacyKey);
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
      localStorage.removeItem(legacyKey);
      return null;
    }

    const migrated = { ...parsed, projectId };
    localStorage.setItem(key, JSON.stringify(migrated));
    localStorage.removeItem(legacyKey);
    return migrated;
  } catch {
    localStorage.removeItem(legacyKey);
    return null;
  }
}

export function useFormDraft(projectId, kind = "leak") {
  const normalizedProjectId = String(projectId ?? "").trim() || null;
  const key = draftKey(normalizedProjectId, kind);
  // Черновик первой версии был только у утечки, и переносить его в карточку
  // нечего: там лежали поля утечки.
  const legacyKey = kind === "leak" ? LEGACY_DRAFT_KEY : null;
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
        if (legacyKey) localStorage.removeItem(legacyKey);
      } catch (e) {
        logger.warn("Draft save failed:", e);
      }
    },
    [key, legacyKey, normalizedProjectId],
  );

  /* ======================================================
     LOAD
     ====================================================== */
  const loadDraft = useCallback(() => {
    try {
      const parsed =
        readValidDraft(key, normalizedProjectId) ??
        migrateLegacyDraft(key, normalizedProjectId, legacyKey);
      if (!parsed) return null;
      const { form, step } = parsed;

      return { form: form ?? {}, step: step ?? 1 };
    } catch (e) {
      logger.warn("Draft load failed:", e);
      removeStoredDraft(key);
      return null;
    }
  }, [key, legacyKey, normalizedProjectId]);

  /* ======================================================
     CLEAR
     ====================================================== */
  const clearDraft = useCallback(() => {
    try {
      removeStoredDraft(key);
      if (legacyKey) localStorage.removeItem(legacyKey);
    } catch (e) {
      logger.warn("Draft clear failed:", e);
    }
  }, [key, legacyKey]);

  /* ======================================================
     HAS DRAFT
     ====================================================== */
  const hasDraft = useCallback(() => {
    try {
      return Boolean(
        readValidDraft(key, normalizedProjectId) ??
        migrateLegacyDraft(key, normalizedProjectId, legacyKey),
      );
    } catch {
      removeStoredDraft(key);
      return false;
    }
  }, [key, legacyKey, normalizedProjectId]);

  return {
    saveDraft,
    loadDraft,
    clearDraft,
    hasDraft,
  };
}
