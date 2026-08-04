import { useEffect, useId, useMemo, useState } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./UserProfileSheet.module.scss";

export default function UserProfileSheet({ open, profile, onSave, onClose }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const titleId = useId();
  const dialogRef = useModalDialog({ open, onClose });

  useEffect(() => {
    if (!open) return;
    setName(profile?.name ?? "");
  }, [open, profile?.name]);

  const texts = useMemo(
    () => ({
      title: t("userProfile.title"),
      subtitle: t("userProfile.subtitle"),
      name: t("userProfile.name"),
      placeholder: t("userProfile.placeholder"),
      cancel: t("userProfile.cancel"),
      save: t("userProfile.save"),
    }),
    [t],
  );

  if (!open) return null;

  const trimmedName = name.trim();
  const initial = trimmedName.slice(0, 1).toUpperCase() || "U";

  const handleSave = () => {
    onSave?.({ name: trimmedName });
    onClose?.();
  };

  return (
    <div className={s.overlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={s.handle} />

        <div className={s.header}>
          <div className={s.avatar}>{initial}</div>
          <div>
            <h2 id={titleId} className={s.title}>
              {texts.title}
            </h2>
            <p className={s.subtitle}>{texts.subtitle}</p>
          </div>
        </div>

        <label className={s.field}>
          <span className={s.label}>{texts.name}</span>
          <input
            className={s.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={texts.placeholder}
            autoFocus
          />
        </label>

        <div className={s.actions}>
          <button type="button" className={s.cancel} onClick={onClose}>
            {texts.cancel}
          </button>
          <button
            type="button"
            className={s.save}
            onClick={handleSave}
            disabled={!trimmedName}
          >
            {texts.save}
          </button>
        </div>
      </div>
    </div>
  );
}
