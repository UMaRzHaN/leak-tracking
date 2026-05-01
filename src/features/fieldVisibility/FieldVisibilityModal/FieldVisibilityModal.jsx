import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import s from "./FieldVisibilityModal.module.scss";

// These keys are managed by the system and can never be hidden
const SYSTEM_KEYS = new Set(["index", "date", "status", "resolvedAt"]);

function buildGroups(config) {
  const { headers, keysOrder } = config.export.excel;
  const headerMap = Object.fromEntries(keysOrder.map((k, i) => [k, headers[i]]));

  const stepFieldKeys = new Set();
  const stepGroups = config.steps.steps
    .map((step) => {
      const fields = step.fields
        .filter((f) => !SYSTEM_KEYS.has(f.key))
        .map((f) => ({ key: f.key, label: f.label, required: !!f.required }));
      fields.forEach((f) => stepFieldKeys.add(f.key));
      return { title: step.title, isStep: true, fields };
    })
    .filter((g) => g.fields.length > 0);

  const excelOnlyFields = keysOrder
    .filter((k) => !stepFieldKeys.has(k) && !SYSTEM_KEYS.has(k))
    .map((k) => ({ key: k, label: headerMap[k] ?? k, required: false }));

  const groups = [...stepGroups];
  if (excelOnlyFields.length > 0) {
    groups.push({ title: "Только Excel (расчётные)", isStep: false, fields: excelOnlyFields });
  }
  return groups;
}

/* =====================================================
   FIELD GROUP
===================================================== */
function FieldGroup({ group, draft, onToggle, onToggleAll, isOpen, onToggleOpen }) {
  const hiddenInGroup = group.fields.filter((f) => draft.has(f.key)).length;
  const allHidden = hiddenInGroup === group.fields.length;
  const allVisible = hiddenInGroup === 0;

  return (
    <div className={s.group}>
      <div className={s.groupHeader} onClick={onToggleOpen} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggleOpen()}>
        <div className={s.groupLeft}>
          <span className={`${s.chevron} ${isOpen ? s.chevronOpen : ""}`}>›</span>
          <span className={s.groupTitle}>{group.title}</span>
          {hiddenInGroup > 0 && (
            <span className={s.groupBadge}>{hiddenInGroup} скрыто</span>
          )}
        </div>
        <button
          className={s.groupAction}
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleAll(group.fields, !allHidden); }}
        >
          {allHidden ? "Показать все" : allVisible ? "Скрыть все" : "Скрыть остальные"}
        </button>
      </div>

      {isOpen && (
        <div className={s.groupFields}>
          {group.fields.map((field) => {
            const isHidden = draft.has(field.key);
            return (
              <div
                key={field.key}
                className={`${s.fieldRow} ${isHidden ? s.fieldRowHidden : ""}`}
                onClick={() => onToggle(field.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onToggle(field.key)}
              >
                <div className={s.fieldInfo}>
                  <span className={s.fieldLabel}>{field.label}</span>
                  <span className={s.fieldKey}>{field.key}</span>
                  {field.required && <span className={s.requiredBadge}>обязательное</span>}
                </div>
                <div
                  className={`${s.toggle} ${!isHidden ? s.toggleOn : ""}`}
                  aria-checked={!isHidden}
                  role="switch"
                >
                  <span className={s.toggleThumb} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =====================================================
   MAIN MODAL
===================================================== */
export default function FieldVisibilityModal({
  open,
  onClose,
  config,
  hiddenFields,
  onSave,
}) {
  const [draft, setDraft] = useState(() => new Set(hiddenFields));
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState(new Set());

  const groups = useMemo(() => buildGroups(config), [config]);

  // Sync draft + expand all groups on open
  useEffect(() => {
    if (!open) return;
    setDraft(new Set(hiddenFields));
    setSearch("");
    setOpenGroups(new Set(groups.map((g) => g.title)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const totalConfigurable = useMemo(
    () => groups.reduce((acc, g) => acc + g.fields.length, 0),
    [groups],
  );
  const hiddenCount = draft.size;
  const visibleCount = totalConfigurable - hiddenCount;

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        fields: g.fields.filter(
          (f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.fields.length > 0);
  }, [groups, search]);

  const toggle = (key) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = (fields, hide) => {
    setDraft((prev) => {
      const next = new Set(prev);
      fields.forEach((f) => (hide ? next.add(f.key) : next.delete(f.key)));
      return next;
    });
  };

  const toggleAccordion = (title) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const isDirty = useMemo(() => {
    if (draft.size !== hiddenFields.size) return true;
    for (const k of draft) if (!hiddenFields.has(k)) return true;
    return false;
  }, [draft, hiddenFields]);

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <>
      <div className={s.backdrop} onClick={onClose} />
      <div className={s.modal}>

        {/* HEADER */}
        <div className={s.header}>
          <div className={s.headerLeft}>
            <h2>Настройка полей</h2>
            <span className={s.counter}>
              {visibleCount} / {totalConfigurable} активно
            </span>
          </div>
          <button className={s.closeBtn} type="button" onClick={onClose}>✕</button>
        </div>

        {/* SEARCH */}
        <div className={s.searchWrap}>
          <span className={s.searchIcon}>⌕</span>
          <input
            className={s.searchInput}
            type="text"
            placeholder="Поиск по названию или ключу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className={s.searchClear} type="button" onClick={() => setSearch("")}>
              ✕
            </button>
          )}
        </div>

        {/* BODY */}
        <div className={s.body}>
          {filteredGroups.length > 0 ? (
            filteredGroups.map((group) => (
              <FieldGroup
                key={group.title}
                group={group}
                draft={draft}
                onToggle={toggle}
                onToggleAll={toggleAll}
                isOpen={openGroups.has(group.title)}
                onToggleOpen={() => toggleAccordion(group.title)}
              />
            ))
          ) : (
            <p className={s.empty}>Поля не найдены</p>
          )}

          <p className={s.systemNote}>
            Поля «№», «Дата обнаружения», «Статус» и «Дата устранения» системные — всегда
            включаются в экспорт Excel.
          </p>
        </div>

        {/* FOOTER */}
        <div className={s.footer}>
          <button
            className={s.resetBtn}
            type="button"
            onClick={() => setDraft(new Set())}
            disabled={draft.size === 0}
          >
            Показать все
          </button>
          <div className={s.footerRight}>
            <button className={s.cancelBtn} type="button" onClick={onClose}>
              Отмена
            </button>
            <button
              className={s.saveBtn}
              type="button"
              onClick={handleSave}
              disabled={!isDirty}
            >
              Сохранить
            </button>
          </div>
        </div>

      </div>
    </>,
    document.body,
  );
}
