import { useId, useRef } from "react";
import s from "./Input.module.scss";

export default function InputCard({
  label,
  value,
  onChange,
  placeholder,
  type = "search",
  as = "input",
  error,
  required = false,
  rightSlot,
  rows = 3,
}) {
  const isTextarea = as === "textarea";
  const showClear = value && String(value).length > 0;

  const inputId = useId();
  const inputRef = useRef(null);
  const isNumber = type === "number";
  return (
    <div
      className={[s.inputCard, required && s.isRequired, error && s.hasError]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={s.inputCardHeader}>
        <label className={s.inputCardLabel} htmlFor={inputId}>
          {label}
          {required && <span className={s.required}> *</span>}
        </label>
        {rightSlot && <div className={s.inputCardSlot}>{rightSlot}</div>}
      </div>

      <div className={s.inputWrapper}>
        {isTextarea ? (
          <textarea
            data-enter-nav
            ref={inputRef}
            id={inputId}
            className={s.inputCardTextarea}
            rows={rows}
            value={value ?? ""}
            placeholder={placeholder || " "}
            onChange={(e) => onChange(e.target.value)}
            enterKeyHint="enter"
          />
        ) : (
          <input
            data-enter-nav
            ref={inputRef}
            id={inputId}
            className={s.inputCardInput}
            type={isNumber ? "text" : type}
            inputMode={isNumber ? "decimal" : undefined}
            enterKeyHint="next"
            value={value ?? ""}
            placeholder={placeholder || " "}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {showClear && (
          <button
            type="button"
            className={s.clearBtn}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
          >
            ✕
          </button>
        )}
      </div>

      {error && <div className={s.inputCardError}>{error}</div>}
    </div>
  );
}
