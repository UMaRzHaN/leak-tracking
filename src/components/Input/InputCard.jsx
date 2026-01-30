import { useId, useRef } from "react";
import s from "./Input.module.scss";

export default function InputCard({
  label,
  value,
  onChange,
  placeholder,
  type = "search",
  as = "input", // input | textarea
  error,
  required = false,
  rightSlot,
  rows = 3,
  onEnter, // 👈 НОВОЕ
}) {
  const isTextarea = as === "textarea";
  const showClear = value && String(value).length > 0;

  const inputId = useId();
  const inputRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key !== "Enter") return;

    // textarea: Shift+Enter → новая строка
    if (isTextarea && e.shiftKey) return;

    e.preventDefault();
    inputRef.current?.blur();
    onEnter?.(inputRef.current);
  };

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
            ref={inputRef}
            id={inputId}
            className={s.inputCardTextarea}
            rows={rows}
            value={value ?? ""}
            placeholder={placeholder || " "}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <input
            ref={inputRef}
            id={inputId}
            className={s.inputCardInput}
            type={type}
            value={value ?? ""}
            placeholder={placeholder || " "}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            inputMode={type === "number" ? "decimal" : undefined}
            enterKeyHint="next"
          />
        )}

        {showClear && (
          <button
            type="button"
            className={s.clearBtn}
            onClick={() => onChange("")}
            aria-label="Очистить"
          >
            ✕
          </button>
        )}
      </div>

      {error && <div className={s.inputCardError}>{error}</div>}
    </div>
  );
}
