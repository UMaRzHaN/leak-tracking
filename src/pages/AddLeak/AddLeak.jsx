import { useEffect, useMemo, useState, useRef } from "react";
import LeakForm from "@/features/leakForm/LeakForm";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useFormDraft } from "@/hooks/useFormDraft";
import { useSafeSave } from "@/hooks/useSafeSave";
import { toNumber } from "@/features/voice/utils/numbers";
import { useProjectData } from "@/app/hooks/useProjectData";
import { useLeakFormContext } from "@/features/leakForm/LeakFormContext";
import { useLanguage } from "@/app/hooks/useLanguage";
import { hapticSuccess, hapticWarning } from "@/utils/haptics";
import { STATUS } from "@/utils/status";
import { priorityFromSpeed } from "@/utils/priority";
import { dataUrlToBlob } from "@/utils/photoConversion";
import s from "./AddLeak.module.scss";

export default function AddLeak({ data, setData, coords, setPage, prevPage }) {
  const { t } = useLanguage();
  const { form, setForm } = useLeakFormContext();
  const { savePhoto, ready: photoReady } = usePhotoStorage();
  const { save } = useProjectData();
  const { saveDraft, loadDraft, clearDraft, hasDraft } = useFormDraft();
  const { isSaving, run } = useSafeSave();
  const [draftPrompt, setDraftPrompt] = useState(false);
  const photoReadyRef = useRef(photoReady);

  const localeTexts = useMemo(
    () => ({
      pageTitle: t("addLeak.pageTitle"),
      stepPrefix: t("addLeak.stepPrefix"),
      draftBanner: {
        message: t("addLeak.draftBanner.message"),
        restore: t("addLeak.draftBanner.restore"),
        discard: t("addLeak.draftBanner.discard"),
      },
      buttons: {
        prev: t("addLeak.buttons.prev"),
        next: t("addLeak.buttons.next"),
        save: t("addLeak.buttons.save"),
        saving: t("addLeak.buttons.saving"),
        clearStep: t("addLeak.buttons.clearStep"),
        clearAll: t("addLeak.buttons.clearAll"),
      },
      confirm: {
        title: t("addLeak.confirm.title"),
        description: t("addLeak.confirm.description"),
        confirmLabel: t("addLeak.confirm.confirmLabel"),
        cancelLabel: t("addLeak.confirm.cancelLabel"),
      },
    }),
    [t],
  );

  useEffect(() => {
    photoReadyRef.current = photoReady;
  }, [photoReady]);

  /* ── Offer to restore draft on mount ── */
  useEffect(() => {
    if (hasDraft() && Object.keys(form).length === 0) {
      setDraftPrompt(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Autosave draft — debounced 1s to avoid thrashing localStorage ── */
  useEffect(() => {
    if (Object.keys(form).length === 0) return;
    const t = setTimeout(() => saveDraft(form, 1), 1000);
    return () => clearTimeout(t);
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

  const waitForPhotoReady = async (timeoutMs = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (photoReadyRef.current) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return photoReadyRef.current;
  };

  const handleAdd = async (row) => {
    return run(async () => {
      try {
        const id = Date.now() * 1000 + Math.floor(Math.random() * 999);
        const lat = toNumber(coords?.lat);
        const lng = toNumber(coords?.lng);

        if (Number.isFinite(lat) && (lat < -90 || lat > 90)) {
          hapticWarning();
          alert(t("addLeak.validation.lat", { lat }));
          return;
        }
        if (Number.isFinite(lng) && (lng < -180 || lng > 180)) {
          hapticWarning();
          alert(t("addLeak.validation.lng", { lng }));
          return;
        }

        /* ── Save photo ── */
        let photoPath = null;
        const rawPhoto = row.photo?.raw ?? dataUrlToBlob(row.photo?.src);
        if (rawPhoto) {
          if (!photoReadyRef.current) {
            const ready = await waitForPhotoReady();
            if (!ready) {
              hapticWarning();
              alert(t("addLeak.validation.photoReady"));
              return;
            }
          }
          photoPath = await savePhoto(rawPhoto, row.leak_id ?? String(id));
        }

        const cleanRow = { ...row };
        delete cleanRow.photo;

        const newRow = {
          id,
          lat,
          lng,
          index: data.length + 1,
          status: STATUS.OPEN,
          priority: priorityFromSpeed(cleanRow.leak_speed),
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
          <span className={s.draftBannerText}>
            {localeTexts.draftBanner.message}
          </span>
          <button
            className={`${s.draftBtn} ${s.draftBtnRestore}`}
            onClick={handleRestoreDraft}
          >
            {localeTexts.draftBanner.restore}
          </button>
          <button
            className={`${s.draftBtn} ${s.draftBtnDiscard}`}
            onClick={handleDiscardDraft}
          >
            {localeTexts.draftBanner.discard}
          </button>
        </div>
      )}

      <LeakForm
        onAdd={handleAdd}
        isSaving={isSaving}
        coords={coords}
        setPage={setPage}
        prevPage={prevPage}
        lastItem={data.at(-1)}
      />
    </>
  );
}
