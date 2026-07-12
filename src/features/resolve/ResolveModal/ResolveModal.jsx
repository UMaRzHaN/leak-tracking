import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import PhotoInput from "@/features/photos/PhotoInput/PhotoInput";
import Notification from "@/components/ui/Notification/Notification";
import s from "./ResolveModal.module.scss";

export default function ResolveModal({ leak, progress, onConfirm, onClose }) {
  const { t } = useTranslation();
  const [photo, setPhoto] = useState(null);
  const [mtr, setMtr] = useState(leak?.materials_equipment ?? "");
  const [note, setNote] = useState(leak?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notification, setNotification] = useState(null);

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
      let photo_after = leak?.photo_after ?? null;
      if (photo?.raw) {
        photo_after = await savePhoto(
          photo.raw,
          `${leak.id}_after`,
          leak?.photo ? [leak.photo] : [],
        );
      }
      onConfirm({
        photo_after,
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
    <div className={s.overlay} onClick={onClose}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <Notification
          notification={notification}
          onClose={() => setNotification(null)}
        />

        <div className={s.handle} />

        <div className={s.header}>
          <div className={s.titleRow}>
            <h2 className={s.title}>{t("resolve.title")}</h2>
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
            label={t("resolve.photoLabel")}
            required
            error={submitted && photoMissing}
          />

          <div className={s.field}>
            <label className={s.label}>{t("resolve.materialsLabel")}</label>
            <textarea
              className={s.textarea}
              value={mtr}
              onChange={(e) => setMtr(e.target.value)}
              placeholder={t("resolve.materialsPlaceholder")}
              rows={3}
            />
          </div>

          <div className={s.field}>
            <label className={s.label}>{t("resolve.noteLabel")}</label>
            <textarea
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
                ? t("resolve.addPhoto")
                : t("resolve.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
