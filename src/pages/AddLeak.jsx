import { useEffect, useState } from "react";
import LeakForm from "../components/LeakForm/LeakForm";
import { usePhotoStorage } from "../hooks/usePhotoStorage";
import { useFormDraft } from "../hooks/useFormDraft";
import { toNumber } from "../utils/voice/normalize/toNumber";
import { useProjectData } from "../app/hooks/useProjectData";
import { findNearbyLeak } from "../utils/geoUtils";
import { hapticSuccess, hapticWarning } from "../utils/haptics";
import { STATUS } from "../utils/status";

const DUPLICATE_RADIUS_M = 50;

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
    try {
      const id = Date.now();
      const lat = toNumber(coords?.lat);
      const lng = toNumber(coords?.lng);

      /* ── Duplicate detection ── */
      const nearby = findNearbyLeak(data, lat, lng, DUPLICATE_RADIUS_M);
      if (nearby) {
        const ok = window.confirm(
          `⚠️ Похожая утечка уже есть в ${nearby.distance} м (№ ${nearby.leak.leak_id ?? nearby.leak.index}).\n\nВсё равно добавить?`,
        );
        if (!ok) { hapticWarning(); return; }
      }

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
  };

  return (
    <>
      {/* ── Draft restore prompt ── */}
      {draftPrompt && (
        <div style={draftBannerStyle}>
          <span>📋 Есть незаконченная запись</span>
          <button onClick={handleRestoreDraft} style={draftBtnStyle("#2563eb")}>Восстановить</button>
          <button onClick={handleDiscardDraft} style={draftBtnStyle("#64748b")}>Удалить</button>
        </div>
      )}

      <LeakForm
        onAdd={handleAdd}
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

/* Inline styles for the draft banner (avoids needing a new CSS module) */
const draftBannerStyle = {
  position: "fixed",
  top: "var(--app-header)",
  left: 0,
  right: 0,
  zIndex: 300,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  background: "#1e293b",
  color: "#f1f5f9",
  fontSize: 13,
  fontWeight: 500,
  boxShadow: "0 4px 12px rgba(0,0,0,.2)",
};

const draftBtnStyle = (bg) => ({
  padding: "5px 12px",
  background: bg,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
});
