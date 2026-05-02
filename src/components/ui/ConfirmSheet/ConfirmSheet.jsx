import s from "./ConfirmSheet.module.scss";

export default function ConfirmSheet({
  open,
  title,
  description,
  onConfirm,
  onCancel,
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

        <div className={s.actions}>
          <button className={s.cancel} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={s.confirm} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
