import { useState } from "react";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import PhotoInput from "@/features/photos/PhotoInput/PhotoInput";
import s from "./ResolveModal.module.scss";

export default function ResolveModal({ leak, progress, onConfirm, onClose }) {
  const [photo, setPhoto] = useState(null);
  const [mtr, setMtr] = useState(leak?.materials_equipment ?? "");
  const [note, setNote] = useState(leak?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { savePhoto } = usePhotoStorage();

  const photoMissing = !photo?.raw;

  const handleConfirm = async () => {
    setSubmitted(true);
    if (photoMissing) return;

    setSaving(true);
    try {
      let photo_after = leak?.photo_after ?? null;
      if (photo?.raw) {
        photo_after = await savePhoto(
          photo.raw,
          `${leak.leak_id ?? String(leak.id)}_after`,
          leak?.photo ? [leak.photo] : [],
        );
      }
      onConfirm({
        photo_after,
        materials_equipment: mtr.trim() || undefined,
        note: note.trim() || undefined,
      });
    } catch {
      alert("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.handle} />

        <div className={s.header}>
          <div className={s.titleRow}>
            <h2 className={s.title}>Устранение утечки</h2>
            {progress && progress.total > 1 && (
              <span className={s.progressBadge}>{progress.current} / {progress.total}</span>
            )}
          </div>
          <p className={s.subtitle}>№ {leak?.leak_id ?? leak?.index ?? "—"}</p>
        </div>

        <div className={s.body}>
          <PhotoInput
            value={photo}
            onChange={setPhoto}
            label="Фото после устранения"
            required
            error={submitted && photoMissing}
          />

          <div className={s.field}>
            <label className={s.label}>МТР (материалы и оборудование)</label>
            <textarea
              className={s.textarea}
              value={mtr}
              onChange={(e) => setMtr(e.target.value)}
              placeholder="Перечислите использованные материалы..."
              rows={3}
            />
          </div>

          <div className={s.field}>
            <label className={s.label}>Примечание</label>
            <textarea
              className={s.textarea}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Дополнительные сведения об устранении..."
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
            Отмена
          </button>
          <button
            className={s.btnConfirm}
            onClick={handleConfirm}
            type="button"
            disabled={saving}
          >
            {saving ? "Сохранение..." : photoMissing && submitted ? "Добавьте фото" : "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  );
}

