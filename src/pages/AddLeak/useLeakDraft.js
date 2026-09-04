import { useEffect } from "react";
import { isLeakFormDirty } from "@/features/leakForm/utils/isLeakFormDirty";

/**
 * Черновик заведения утечки: предложение вернуться и сохранение на ходу.
 *
 * Черновик привязан к проекту: восстановить набранное в одном проекте, стоя в
 * другом, значило бы завести утечку не там, где её нашли.
 */
export function useLeakDraft({
  clearDraft,
  draftPrompt,
  draftReadyProjectId,
  form,
  loadDraft,
  normalizedProjectId,
  saveDraft,
  setDraftPrompt,
  setDraftReadyProjectId,
  setForm,
}) {
  /* Offer to restore draft on mount */
  useEffect(() => {
    const storedDraft = loadDraft();
    const draftExists = isLeakFormDirty(storedDraft?.form);
    if (storedDraft && !draftExists) clearDraft();
    setDraftPrompt(draftExists);
    setDraftReadyProjectId(draftExists ? null : normalizedProjectId);
  }, [
    clearDraft,
    loadDraft,
    normalizedProjectId,
    setDraftPrompt,
    setDraftReadyProjectId,
  ]);

  /* Autosave draft with a short debounce */
  useEffect(() => {
    if (draftPrompt || draftReadyProjectId !== normalizedProjectId) {
      return;
    }
    if (!isLeakFormDirty(form)) {
      clearDraft();
      return;
    }
    const t = setTimeout(() => saveDraft(form, 1), 1000);
    return () => clearTimeout(t);
  }, [
    clearDraft,
    draftPrompt,
    draftReadyProjectId,
    form,
    normalizedProjectId,
    saveDraft,
  ]);

  /* Restore draft */
  const handleRestoreDraft = () => {
    const draft = loadDraft();
    if (draft?.form) setForm(draft.form);
    setDraftPrompt(false);
    setDraftReadyProjectId(normalizedProjectId);
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setDraftPrompt(false);
    setDraftReadyProjectId(normalizedProjectId);
  };

  return { handleDiscardDraft, handleRestoreDraft };
}
