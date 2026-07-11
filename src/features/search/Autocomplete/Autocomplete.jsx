import { useState, useRef, useEffect, useMemo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { smartFilter } from "./smartFilter";
import s from "./Autocomplete.module.scss";

export default function Autocomplete({
  id,
  label,
  value,
  options = [],
  onChange,
  error,
  placeholder = "",
  required = false,
  onComplete,
  hint,
}) {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? "");
  const inputRef = useRef(null);

  useEffect(() => {
    setQuery(value ?? "");
  }, [value]);

  const filtered = useMemo(() => smartFilter(query, options), [options, query]);
  const showClear = query?.length > 0;

  const select = (selectedValue) => {
    setQuery(selectedValue);
    onChange(selectedValue);
    onComplete?.(selectedValue);
    setOpen(false);
    inputRef.current?.focus();
  };

  const clear = () => {
    setQuery("");
    onChange("");
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div
      className={[s.formField, required && s.isRequired, error && s.hasError]
        .filter(Boolean)
        .join(" ")}
    >
      <label htmlFor={id} className={s.formLabel}>
        {label}
        {required && <span className={s.required}> *</span>}
      </label>

      <div className={s.inputWrapper}>
        <input
          data-enter-nav
          ref={inputRef}
          id={id}
          className={s.formInput}
          type="text"
          value={query}
          placeholder={placeholder || " "}
          enterKeyHint="next"
          inputMode="text"
          onFocus={() => setOpen(true)}
          onBlur={() => {
            requestAnimationFrame(() => {
              if (!document.activeElement?.closest(`.${s.autocompleteList}`)) {
                setOpen(false);
              }
            });
          }}
          onChange={(e) => {
            const nextValue = e.target.value;
            setQuery(nextValue);
            onChange(nextValue);
            setOpen(true);
          }}
        />

        {showClear && (
          <button
            type="button"
            className={s.clearBtn}
            tabIndex={-1}
            aria-label={lang === "ru" ? "Очистить" : "Clear"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
          >
            ✕
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <ul className={s.autocompleteList}>
          {filtered.map((option, index) => (
            <li
              key={`${option}-${index}`}
              className={s.autocompleteItem}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(option)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}

      {hint && !error && <p className={s.hint}>{hint}</p>}
      {error && <div className={s.formError}>{error}</div>}
    </div>
  );
}
