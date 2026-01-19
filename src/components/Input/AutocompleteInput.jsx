import { useState, useRef, useEffect } from "react";
import s from "./Input.module.scss";

export default function AutocompleteInput({
  id,
  label,
  value,
  options = [],
  onChange,
  error,
  placeholder = "",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? "");
  const inputRef = useRef(null);

  const showClear = query && query.length > 0;

  /* синхронизация с внешним value (voice) */
  useEffect(() => {
    setQuery(value ?? "");
  }, [value]);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase())
  );

  const select = (val) => {
    setQuery(val);
    onChange(val);
    setOpen(false);
    inputRef.current?.blur();
  };

  const clear = () => {
    setQuery("");
    onChange("");
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className={[s.formField, error && s.hasError].filter(Boolean).join(" ")}>
      {label && (
        <label htmlFor={id} className={s.formLabel}>
          {label}
        </label>
      )}

      <div className={s.inputWrapper}>
        <input
          ref={inputRef}
          id={id}
          className={s.formInput}
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
          autoComplete="off"
        />

        {showClear && (
          <button
            type="button"
            className={s.clearBtn}
            onMouseDown={(e) => e.preventDefault()} // важно!
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
              onMouseDown={(e) => e.preventDefault()} // чтобы blur не закрыл раньше
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
