import { useState, useRef, useEffect } from "react";
import s from "./Input.module.scss";

export default function AutocompleteTextarea({
  id,
  label,
  value,
  options = [],
  onChange,
  error,
  placeholder = "",
  rows = 1,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? "");
  const textareaRef = useRef(null);

  const showClear = query && query.length > 0;

  /* синхронизация с внешним value (voice) */
  useEffect(() => {
    setQuery(value ?? "");
  }, [value]);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase()),
  );

  const select = (val) => {
    setQuery(val);
    onChange(val);
    setOpen(false);
    textareaRef.current?.blur();
  };

  const clear = () => {
    setQuery("");
    onChange("");
    setOpen(false);
    textareaRef.current?.focus();
  };

  return (
    <div className={[s.formField, error && s.hasError].filter(Boolean).join(" ")}>
      {label && (
        <label htmlFor={id} className={s.formLabel}>
          {label}
        </label>
      )}

      <div className={s.inputWrapper}>
        <textarea
          ref={textareaRef}
          id={id}
          className={s.formTextarea}
          rows={rows}
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            onChange(v);
            setOpen(true);
          }}
        />

        {showClear && (
          <button
            type="button"
            className={s.clearBtn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            aria-label="Очистить"
          >
            ✕
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <ul className={s.autocompleteList}>
          {filtered.map((opt, i) => (
            <li
              key={i}
              className={s.autocompleteItem}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(opt)}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}

      {error && <div className={s.formError}>{error}</div>}
    </div>
  );
}
