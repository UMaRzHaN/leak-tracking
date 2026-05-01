import { useState, useRef, useEffect } from "react";
import s from "./SearchFieldSelect.module.scss";

export default function SearchFieldSelect({
  value,
  onChange,
  options = [],
  placeholder = "Выберите поле",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const currentLabel =
    options.find((o) => o.key === value)?.label || placeholder;

  useEffect(() => {
    if (!open) return;

    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);

    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  return (
    <div className={s.dropdown} ref={ref}>
      <button
        type="button"
        className={s.button}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={s.label}>{currentLabel}</span>
        <span className={s.arrow}>▾</span>
      </button>

      {open && (
        <div className={s.menu}>
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`${s.option} ${o.key === value ? s.active : ""}`}
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
