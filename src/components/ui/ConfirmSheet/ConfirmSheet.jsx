import s from "./ConfirmSheet.module.scss";

export default function ConfirmSheet({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  secondaryActionLabel,
  onSecondaryAction,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
}) {
  if (!open) return null;

  return (
    <div className={s.overlay} onClick={onCancel}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.handle} />

        <h3 className={s.title}>{title}</h3>
        <p className={s.description}>{description}</p>

        <div
          className={`${s.actions} ${secondaryActionLabel ? s.actionsWithSecondary : ""}`}
        >
          <button type="button" className={s.cancel} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={s.confirm} onClick={onConfirm}>
            {confirmLabel}
          </button>
          {secondaryActionLabel && (
            <button
              type="button"
              className={s.secondaryAction}
              onClick={onSecondaryAction}
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
