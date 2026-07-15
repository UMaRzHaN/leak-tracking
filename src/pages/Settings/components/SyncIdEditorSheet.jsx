import { useEffect, useRef } from "react";
import s from "./SyncIdEditorSheet.module.scss";

export default function SyncIdEditorSheet({
  state,
  onChange,
  onConfirm,
  onCancel,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!state.open) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 80);
    return () => clearTimeout(timer);
  }, [state.open]);

  if (!state.open) return null;

  return (
    <div className={s.overlay} onClick={onCancel}>
      <div className={s.sheet} onClick={(event) => event.stopPropagation()}>
        <div className={s.handle} />
        <h3 className={s.title}>{state.title}</h3>
        <p className={s.description}>{state.description}</p>

        <label className={s.field}>
          <span>{state.inputLabel}</span>
          <input
            ref={inputRef}
            value={state.value}
            onChange={(event) => onChange(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === "Enter") onConfirm();
              if (event.key === "Escape") onCancel();
            }}
          />
        </label>

        <div className={s.actions}>
          <button type="button" className={s.cancel} onClick={onCancel}>
            {state.cancelLabel}
          </button>
          <button type="button" className={s.confirm} onClick={onConfirm}>
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
