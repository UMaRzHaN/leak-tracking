import { useId, useRef } from "react";
import { parseNumericInput } from "@/utils/normalize/parseNumericInput";
import { normalizeNumber } from "@/utils/normalize/normalizeNumber";
import { maskDateInput } from "@/utils/normalize/maskDateInput";
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
             * would collapse.
             *
             * Дата — тоже текст, и по той же причине. Календарь платформы
             * открывался на текущем месяце и требовал долистать до года
             * монтажа: с шильдика число читают и набирают, а не выбирают.
             * Формат остался прежним — ДД.ММ.ГГГГ, точки ставит maskDateInput.
             */
            type={isNumber || isDate ? "text" : type}
            inputMode={isNumber ? "decimal" : isDate ? "numeric" : undefined}
            enterKeyHint="next"
            value={value ?? ""}
            placeholder={placeholder ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (isNumber) return onChange(parseNumericInput(raw));
              if (isDate) return onChange(maskDateInput(raw));
              onChange(raw);
            }}
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

        {hasValue && (
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
