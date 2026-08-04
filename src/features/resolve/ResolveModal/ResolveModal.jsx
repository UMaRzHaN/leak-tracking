import { useEffect, useId, useState } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useTranslation } from "react-i18next";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import PhotoInput from "@/features/photos/PhotoInput/PhotoInput";
import Notification from "@/components/ui/Notification/Notification";
import s from "./ResolveModal.module.scss";

export default function ResolveModal({
  leak,
  progress = null,
  mode = "resolved",
  onConfirm,
  onClose,
}) {
  const { t } = useTranslation();
  const isRepair = mode === "repair";
  // Repair mode overrides four of the labels; the rest of the modal is shared.
  const scope = isRepair ? "resolve.repair" : "resolve";
  const labels = {
    title: t(`${scope}.title`),
    photoLabel: t(`${scope}.photoLabel`),
    confirm: t(`${scope}.confirm`),
    addPhoto: t(`${scope}.addPhoto`),
  };
  const [photo, setPhoto] = useState(null);
  const [mtr, setMtr] = useState(leak?.materials_equipment ?? "");
  const [note, setNote] = useState(leak?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notification, setNotification] = useState(null);
  const titleId = useId();
  const materialsId = useId();
  const noteId = useId();
  const dialogRef = useModalDialog({
    onClose,
    closeDisabled: saving,
  });

  const { savePhoto } = usePhotoStorage();

  const photoMissing = !photo?.raw;

  useEffect(() => {
    setPhoto(null);
    setMtr(leak?.materials_equipment ?? "");
    setNote(leak?.note ?? "");
    setSubmitted(false);
    setNotification(null);
  }, [leak?.id, leak?.materials_equipment, leak?.note]);

  const handleConfirm = async () => {
    setSubmitted(true);
    if (photoMissing) return;

    setSaving(true);
    setNotification(null);
    try {
      let photoPath = isRepair
        ? (leak?.photo_repair ?? null)
        : (leak?.photo_after ?? null);
      if (photo?.raw) {
        photoPath = await savePhoto(
          photo.raw,
          isRepair ? `${leak.id}_repair` : `${leak.id}_after`,
          (isRepair
            ? [leak?.photo, leak?.photo_after, leak?.photo_repair]
            : [leak?.photo, leak?.photo_repair, leak?.photo_after]
          ).filter(Boolean),
          { cleanupOldVersions: false },
        );
      }
      if (photo?.raw && !photoPath) {
        throw new Error("Photo storage did not return a saved path");
      }
      await onConfirm({
        ...(isRepair
          ? { photo_repair: photoPath }
          : { photo_after: photoPath }),
        materials_equipment: mtr.trim() || undefined,
        note: note.trim() || undefined,
      });
    } catch {
      setNotification({
        type: "error",
        message: t("resolve.error"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.overlay} onClick={saving ? undefined : onClose}>
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <Notification
          notification={notification}
          onClose={() => setNotification(null)}
        />

        <div className={s.handle} />

        <div className={s.header}>
          <div className={s.titleRow}>
            <h2 id={titleId} className={s.title}>
              {labels.title}
            </h2>
            {progress && progress.total > 1 && (
              <span className={s.progressBadge}>
                {progress.current} / {progress.total}
              </span>
            )}
          </div>
          <p className={s.subtitle}>№ {leak?.leak_id ?? leak?.index ?? "—"}</p>
        </div>

        <div className={s.body}>
          <PhotoInput
            value={photo}
            onChange={setPhoto}
            label={labels.photoLabel}
            required
            error={submitted && photoMissing}
          />

          <div className={s.field}>
            <label className={s.label} htmlFor={materialsId}>
              {t("resolve.materialsLabel")}
            </label>
            <textarea
              id={materialsId}
              className={s.textarea}
              value={mtr}
              onChange={(e) => setMtr(e.target.value)}
              placeholder={t("resolve.materialsPlaceholder")}
              rows={3}
            />
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor={noteId}>
              {t("resolve.noteLabel")}
            </label>
            <textarea
              id={noteId}
              className={s.textarea}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("resolve.notePlaceholder")}
              rows={2}
            />
          </div>
        </div>

        <div className={s.footer}>
          <button
            className={s.btnCancel}
            onClick={onClose}
            type="button"
            disabled={saving}
          >
            {t("resolve.cancel")}
          </button>
          <button
            className={s.btnConfirm}
            onClick={handleConfirm}
            type="button"
            disabled={saving}
          >
            {saving
              ? t("resolve.saving")
              : photoMissing && submitted
                ? labels.addPhoto
                : labels.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
