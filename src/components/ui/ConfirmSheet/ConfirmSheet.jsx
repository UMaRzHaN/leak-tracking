import { useEffect, useId, useRef, useState } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import s from "./ConfirmSheet.module.scss";

export default function ConfirmSheet({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  secondaryActionLabel = null,
  onSecondaryAction = null,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  onActionError = null,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const handleCancel = () => {
    if (!pendingRef.current) onCancel?.();
  };
  const dialogRef = useModalDialog({
    open,
    onClose: handleCancel,
    closeDisabled: pending,
  });

  useEffect(() => {
    if (open) return;
    pendingRef.current = false;
    setPending(false);
  }, [open]);

  const runAction = async (action) => {
    if (pendingRef.current || typeof action !== "function") return;
    pendingRef.current = true;
    setPending(true);
    try {
      await action();
    } catch (error) {
      onActionError?.(error);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  if (!open) return null;

  return (
    <div className={s.overlay} onClick={handleCancel}>
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={pending}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.handle} />

        <h3 id={titleId} className={s.title}>
          {title}
        </h3>
        <p id={descriptionId} className={s.description}>
          {description}
        </p>

        <div
          className={`${s.actions} ${secondaryActionLabel ? s.actionsWithSecondary : ""}`}
        >
          <button
            type="button"
            className={s.cancel}
            onClick={handleCancel}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={s.confirm}
            onClick={() => runAction(onConfirm)}
            disabled={pending}
          >
            {confirmLabel}
          </button>
          {secondaryActionLabel && (
            <button
              type="button"
              className={s.secondaryAction}
              onClick={() => runAction(onSecondaryAction)}
              disabled={pending}
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
