import { useEffect, useState } from "react";
import LeakForm from "../components/LeakForm/LeakForm";
import { usePhotoStorage } from "../hooks/usePhotoStorage";
import { useFormDraft } from "../hooks/useFormDraft";
import { useSafeSave } from "../hooks/useSafeSave";
import { toNumber } from "../utils/voice/toNumber";
import { useProjectData } from "../app/hooks/useProjectData";
import { hapticSuccess, hapticWarning } from "../utils/haptics";
import { STATUS } from "../utils/status";
import s from "./AddLeak.module.scss";


export default function AddLeak({
  data,
  setData,
  coords,
  voiceData,
  clearVoiceData,
  startVoiceInput,
  stopVoiceInput,
  setPage,
  form,
  errors,
  handle,
  setErrors,
  setForm,
}) {
  const { savePhoto, ready: photoReady } = usePhotoStorage();
  const { save } = useProjectData();
  const { saveDraft, loadDraft, clearDraft, hasDraft } = useFormDraft();
  const { isSaving, run } = useSafeSave();
  const [draftPrompt, setDraftPrompt] = useState(false);

  /* ── Offer to restore draft on mount ── */
  useEffect(() => {
    if (hasDraft() && Object.keys(form).length === 0) {
      setDraftPrompt(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Autosave draft on every form change ── */
  useEffect(() => {
    if (Object.keys(form).length > 0) saveDraft(form, 1);
  }, [form, saveDraft]);

  /* ── Restore draft ── */
  const handleRestoreDraft = () => {
    const draft = loadDraft();
    if (draft?.form) setForm(draft.form);
    setDraftPrompt(false);
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setDraftPrompt(false);
  };

  const handleAdd = async (row) => {
    return run(async () => {
      try {
        const id = Date.now();
        const lat = toNumber(coords?.lat);
        const lng = toNumber(coords?.lng);

        /* ── Save photo ── */
        let photoPath = null;
        if (row.photo?.raw) {
          if (photoReady) {
            photoPath = await savePhoto(row.photo.raw, row.leak_id ?? String(id));
          }
        }

        const { photo, ...cleanRow } = row;

        const newRow = {
          id,
          lat,
          lng,
          index: data.length + 1,
          status: STATUS.OPEN,
          history: [{ action: "created", date: new Date().toISOString() }],
          ...cleanRow,
          photo: photoPath,
        };

        const updated = [...data, newRow];
        setData(updated);
        await save(updated);

        clearDraft();
        hapticSuccess();
        setPage("");
      } catch (err) {
        console.error("Error adding leak:", err);
        hapticWarning();
      }
    });
  };

  return (
    <>
      {draftPrompt && (
        <div className={s.draftBanner}>
          <span className={s.draftBannerText}>📋 Есть незаконченная запись</span>
          <button
            className={`${s.draftBtn} ${s.draftBtnRestore}`}
            onClick={handleRestoreDraft}
          >
            Восстановить
          </button>
          <button
            className={`${s.draftBtn} ${s.draftBtnDiscard}`}
            onClick={handleDiscardDraft}
          >
            Удалить
          </button>
        </div>
      )}

      <LeakForm
        onAdd={handleAdd}
        isSaving={isSaving}
        voiceData={voiceData}
        clearVoiceData={clearVoiceData}
        startVoiceInput={startVoiceInput}
        stopVoiceInput={stopVoiceInput}
        coords={coords}
        setPage={setPage}
        lastItem={data.at(-1)}
        form={form}
        errors={errors}
        handle={handle}
        setErrors={setErrors}
        setForm={setForm}
      />
    </>
  );
}