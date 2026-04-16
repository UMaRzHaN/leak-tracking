import { useCallback } from "react";

const DRAFT_KEY = "app:form_draft_v1";

export function useFormDraft() {
  const saveDraft = useCallback((form, step) => {
    try {
      // Не сохраняем сырые фото (Blob/File — не сериализуются)
      const { photo, ...rest } = form;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form: rest, step, savedAt: Date.now() }));
    } catch {}
  }, []);

  const loadDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const { form, step, savedAt } = JSON.parse(raw);
      // Черновик старше 24 часов — не восстанавливаем
      if (Date.now() - savedAt > 86_400_000) { clearDraft(); return null; }
      return { form, step };
    } catch { return null; }
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
  }, []);

  const hasDraft = useCallback(() => {
    return !!localStorage.getItem(DRAFT_KEY);
  }, []);

  return { saveDraft, loadDraft, clearDraft, hasDraft };
}
