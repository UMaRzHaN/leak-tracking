import { useId, useRef } from "react";
import { parseNumericInput } from "../../utils/normalize/parseNumericInput";
import { normalizeNumber } from "../../utils/normalize/normalizeNumber";
import s from "./Input.module.scss";

/**
 * A single labelled input field for the leak form.
 * Props:
 *  label, value, onChange, type ("text"|"number"), as ("input"|"textarea"),
 *  error, required, rows, rightSlot
 */
export default function InputCard({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  as = "input",
  error,
  required = false,
  rightSlot,
  rows = 3,
  hint,
}) {
  const isTextarea = as === "textarea";
  const isNumber   = type === "number";
  const hasValue   = value != null && value !== "" && String(value).length > 0;

  const inputId  = useId();
  const inputRef = useRef(null);

  const className = [
    s.field,
    hasValue  && s.hasValue,
    required  && s.isRequired,
    error     && s.hasError,
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <label className={s.label} htmlFor={inputId}>
        {label}
        {required && <span className={s.req}> *</span>}
        {rightSlot && <span className={s.rightSlot}>{rightSlot}</span>}
      </label>

      <div className={s.inputWrapper}>
        {isTextarea ? (
          <textarea
            data-enter-nav
            ref={inputRef}
            id={inputId}
            className={s.control}
            rows={rows}
            value={value ?? ""}
            placeholder={placeholder ?? ""}
            onChange={(e) => onChange(e.target.value)}
            enterKeyHint="enter"
          />
        ) : (
          <input
            data-enter-nav
            ref={inputRef}
            id={inputId}
            className={s.control}
            type="text"
            inputMode={isNumber ? "decimal" : "text"}
            enterKeyHint="next"
            value={value ?? ""}
            placeholder={placeholder ?? ""}
            onChange={(e) => onChange(isNumber ? parseNumericInput(e.target.value) : e.target.value)}
            onBlur={isNumber ? () => { if (value !== "" && value != null) onChange(normalizeNumber(value)); } : undefined}
          />
        )}

        {hasValue && (
          <button
            type="button"
            className={s.clearBtn}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(""); inputRef.current?.focus(); }}
            aria-label="Очистить"
          >
            ✕
          </button>
        )}
      </div>

      {hint && !error && <p className={s.hint}>{hint}</p>}
      {error && <p className={s.errorMsg}>{error}</p>}
    </div>
  );
}
