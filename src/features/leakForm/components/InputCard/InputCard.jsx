import { useId, useRef } from "react";
import { parseNumericInput } from "@/utils/normalize/parseNumericInput";
import { normalizeNumber } from "@/utils/normalize/normalizeNumber";
import s from "./InputCard.module.scss";

export default function InputCard({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  as = "input",
  error,
  required = false,
  rightSlot = null,
  rows = 3,
  hint,
}) {
  const isTextarea = as === "textarea";
  const isNumber = type === "number";
  const isDate = type === "date";
  const hasValue = value != null && value !== "" && String(value).length > 0;

  const inputId = useId();
  const inputRef = useRef(null);

  const className = [
    s.field,
    hasValue && s.hasValue,
    required && s.isRequired,
    error && s.hasError,
  ]
    .filter(Boolean)
    .join(" ");

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
            /*
             * Numbers stay a text box on purpose: parseNumericInput keeps
             * "4,0" readable while it is being typed, which a number input
             * would collapse. Anything else — a date, most of all — gets the
             * control the platform provides.
             */
            type={isNumber ? "text" : type}
            inputMode={isNumber ? "decimal" : undefined}
            /*
             * Opening the picker from anywhere in the field rather than from
             * the glyph alone: the glyph is 22px, and the person tapping it is
             * wearing gloves in front of a wellhead.
             */
            onClick={
              isDate
                ? (event) => {
                    if (typeof event.currentTarget.showPicker === "function") {
                      event.currentTarget.showPicker();
                    }
                  }
                : undefined
            }
            enterKeyHint="next"
            value={value ?? ""}
            placeholder={placeholder ?? ""}
            onChange={(e) =>
              onChange(
                isNumber ? parseNumericInput(e.target.value) : e.target.value,
              )
            }
            onBlur={
              isNumber
                ? () => {
                    if (value !== "" && value != null)
                      onChange(normalizeNumber(value));
                  }
                : undefined
            }
          />
        )}

        {hasValue && !isDate && (
          <button
            type="button"
            className={s.clearBtn}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
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
