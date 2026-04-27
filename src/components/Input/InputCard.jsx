import { useId, useRef, useState } from "react";
import { parseNumericInput } from "../../utils/normalize/parseNumericInput";
import { normalizeNumber } from "../../utils/normalize/normalizeNumber";
import s from "./Input.module.scss";

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
  const [isFocused, setIsFocused] = useState(false);

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
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
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
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              if (isNumber && value !== "" && value != null) onChange(normalizeNumber(value));
            }}
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

      {hint && !error && (
        <p className={[s.hint, hasValue && !isFocused && s.hintHidden].filter(Boolean).join(" ")}>
          {hint}
        </p>
      )}
      {error && <p className={s.errorMsg}>{error}</p>}
    </div>
  );
}
