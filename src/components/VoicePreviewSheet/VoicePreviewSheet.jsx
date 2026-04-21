import { useState, useMemo } from "react";
import s from "./VoicePreviewSheet.module.scss";

/**
 * Bottom sheet showing voice-parsed fields before they're applied to the form.
 * User can toggle individual fields on/off, then confirm or dismiss.
 *
 * @param {object}   pending   — parsed key→value map (null = hidden)
 * @param {object[]} steps     — all form step configs (for label lookup)
 * @param {Function} onConfirm — called with the selected subset of pending
 * @param {Function} onDismiss — called when user cancels
 */
export default function VoicePreviewSheet({ pending, steps, onConfirm, onDismiss }) {
  const labelMap = useMemo(() => {
    const map = {};
    steps?.forEach((step) =>
      step.fields?.forEach((f) => {
        map[f.key] = f.label;
      }),
    );
    return map;
  }, [steps]);

  const entries = useMemo(
    () =>
      Object.entries(pending ?? {}).filter(
        ([, v]) => v !== undefined && v !== null && v !== "",
      ),
    [pending],
  );

  const [selected, setSelected] = useState(() => new Set(entries.map(([k]) => k)));

  // Reset selection whenever pending changes
  useMemo(() => {
    setSelected(new Set(entries.map(([k]) => k)));
  }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pending) return null;

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    const confirmed = {};
    entries.forEach(([k, v]) => {
      if (selected.has(k)) confirmed[k] = v;
    });
    onConfirm(confirmed);
  };

  const formatValue = (v) => {
    if (typeof v === "number") return String(v);
    return String(v);
  };

  return (
    <div className={s.overlay} onClick={onDismiss}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.handle} />
        <p className={s.title}>Распознано голосом 🎤</p>

        {entries.length === 0 ? (
          <p className={s.empty}>Ничего не распознано</p>
        ) : (
          <div className={s.list}>
            {entries.map(([key, value]) => (
              <button
                key={key}
                type="button"
                className={`${s.row} ${selected.has(key) ? s.checked : ""}`}
                onClick={() => toggle(key)}
              >
                <span className={s.check}>{selected.has(key) ? "✓" : ""}</span>
                <span className={s.fieldLabel}>{labelMap[key] ?? key}</span>
                <span className={s.value}>{formatValue(value)}</span>
              </button>
            ))}
          </div>
        )}

        <div className={s.actions}>
          <button className={s.cancel} type="button" onClick={onDismiss}>
            Отменить
          </button>
          <button
            className={s.confirm}
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
          >
            Применить ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
