import { useState, useRef, useEffect } from "react";

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
  const rootRef = useRef(null);

  /* синхронизация с внешним value (важно для voice) */
  useEffect(() => {
    setQuery(value ?? "");
  }, [value]);

  /* закрытие при клике вне */
  useEffect(() => {
    const onClickOutside = (e) => {
      if (!rootRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase())
  );

  const select = (val) => {
    setQuery(val);
    onChange(val);
    setOpen(false);
  };

  return (
    <div className={`form-field ${error ? "error" : ""}`} ref={rootRef}>
      {label && <label htmlFor={id}>{label}</label>}

      <input
        id={id}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          onChange(v);
          setOpen(true);
        }}
        autoComplete="off"
      />

      {open && filtered.length > 0 && (
        <ul className="autocomplete-list">
          {filtered.map((opt, i) => (
            <li key={i} onClick={() => select(opt)}>
              {opt}
            </li>
          ))}
        </ul>
      )}

      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
