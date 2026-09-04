import { useCallback, useEffect } from "react";
import { isFormDirty } from "@/features/leakForm/utils/isLeakFormDirty";

// Координаты подставляет приёмник, а не человек: черновик, в котором есть
// только они, восстанавливать не из чего.
const DRAFT_DERIVED_FIELDS = ["lat", "lng"];

/**
 * Черновик карточки компонента: сохранение на ходу и предложение вернуться.
 *
 * Отделено от самой формы: там про шаги мастера и проверку полей, здесь — про
 * то, что набранное не должно пропасть, если приложение закрыли на середине.
 */
export function useComponentDraft({
  clearDraft,
  draftEnabled,
  draftPrompt,
  draftReady,
  form,
  loadDraft,
  saveDraft,
  setDraftPrompt,
  setDraftReady,
  setForm,
  setStep,
  step,
}) {
  useEffect(() => {
    if (!draftEnabled) {
      setDraftReady(true);
      return;
    }
    const stored = loadDraft();
    const worthRestoring = isFormDirty(stored?.form, DRAFT_DERIVED_FIELDS);
    if (stored && !worthRestoring) clearDraft();
    setDraftPrompt(worthRestoring);
    setDraftReady(!worthRestoring);
  }, [clearDraft, draftEnabled, loadDraft, setDraftPrompt, setDraftReady]);

  useEffect(() => {
    if (!draftEnabled || draftPrompt || !draftReady) return undefined;
    if (!isFormDirty(form, DRAFT_DERIVED_FIELDS)) {
      clearDraft();
      return undefined;
    }
    const timer = setTimeout(() => saveDraft(form, step), 1000);
    return () => clearTimeout(timer);
  }, [
    clearDraft,
    draftEnabled,
    draftPrompt,
    draftReady,
    form,
    saveDraft,
    step,
  ]);

  const handleRestoreDraft = useCallback(() => {
    const stored = loadDraft();
    if (stored?.form) setForm(stored.form);
    if (stored?.step) setStep(stored.step);
    setDraftPrompt(false);
    setDraftReady(true);
  }, [loadDraft, setDraftPrompt, setDraftReady, setForm, setStep]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft();
    setDraftPrompt(false);
    setDraftReady(true);
  }, [clearDraft, setDraftPrompt, setDraftReady]);

  return { handleDiscardDraft, handleRestoreDraft };
}
