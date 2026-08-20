import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import s from "./FieldVisibilityModal.module.scss";
import { useLanguage } from "@/app/hooks/useLanguage";
import { PROTECTED_FIELD_KEYS } from "@/configs/shared/protectedFields";
import { fieldLabel } from "@/utils/fieldLabels";

// These keys are managed by the system and can never be hidden
const SYSTEM_KEYS = PROTECTED_FIELD_KEYS;

const STEP_TITLE_KEYS = {
  Основное: "basic",
  "МТР и Описание *": "mtrAndDescription",
  "Примечание и фото": "noteAndPhoto",
};

function translateStepTitle(title, t) {
  const key = STEP_TITLE_KEYS[title];
  return key ? t(`addLeak.stepTitles.${key}`) : title;
}

function buildGroups(config, localeTexts, t) {
  const { headers, keysOrder } = config.export.excel;
  const headerMap = Object.fromEntries(
    keysOrder.map((k, i) => [k, headers[i]]),
  );

  const stepFieldKeys = new Set();
  const stepGroups = config.steps.steps
    .map((step) => {
      const fields = step.fields
        .filter((f) => !SYSTEM_KEYS.has(f.key))
        .map((f) => ({
          key: f.key,
          label: fieldLabel(f.key, t, f.label),
          required: !!f.required,
        }));
      fields.forEach((f) => stepFieldKeys.add(f.key));
      return {
        title: translateStepTitle(step.title, t),
        isStep: true,
        fields,
      };
    })
    .filter((g) => g.fields.length > 0);

  const excelOnlyFields = keysOrder
    .filter((k) => !stepFieldKeys.has(k) && !SYSTEM_KEYS.has(k))
    .map((k) => ({
      key: k,
      label: fieldLabel(k, t, headerMap[k] ?? k),
      required: false,
    }));

  const groups = [...stepGroups];
  if (excelOnlyFields.length > 0) {
    groups.push({
      title: localeTexts.excelOnly,
      isStep: false,
      fields: excelOnlyFields,
    });
  }
  return groups;
}

function toConfigurableHiddenSet(hiddenFields) {
  return new Set(
    [...hiddenFields].filter((key) => !PROTECTED_FIELD_KEYS.has(key)),
  );
}

/* =====================================================
   FIELD GROUP
===================================================== */
function FieldGroup({
  group,
  draft,
  onToggle,
  onToggleAll,
  isOpen,
  onToggleOpen,
  localeTexts,
}) {
  const hiddenInGroup = group.fields.filter((f) => draft.has(f.key)).length;
  const allHidden = hiddenInGroup === group.fields.length;
  const allVisible = hiddenInGroup === 0;

  return (
    <div className={s.group}>
      <div
        className={s.groupHeader}
        onClick={onToggleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggleOpen()}
      >
        <div className={s.groupLeft}>
          <span className={`${s.chevron} ${isOpen ? s.chevronOpen : ""}`}>
            ›
          </span>
          <span className={s.groupTitle}>{group.title}</span>
          {hiddenInGroup > 0 && (
            <span className={s.groupBadge}>
              {hiddenInGroup} {localeTexts.hidden}
            </span>
          )}
        </div>
        <button
          className={s.groupAction}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleAll(group.fields, !allHidden);
          }}
        >
          {allHidden
            ? localeTexts.showAll
            : allVisible
              ? localeTexts.hideAll
              : localeTexts.hideOthers}
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
                  {field.required && (
                    <span className={s.requiredBadge}>
                      {localeTexts.required}
                    </span>
                  )}
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
  const { t } = useLanguage();
  const localeTexts = useMemo(
    () => ({
      title: t("fieldVisibility.title"),
      active: t("fieldVisibility.active"),

      searchPlaceholder: t("fieldVisibility.searchPlaceholder"),
      notFound: t("fieldVisibility.notFound"),

      excelOnly: t("fieldVisibility.excelOnly"),

      hidden: t("fieldVisibility.hidden"),
      required: t("fieldVisibility.required"),

      showAll: t("fieldVisibility.showAll"),
      hideAll: t("fieldVisibility.hideAll"),
      hideOthers: t("fieldVisibility.hideOthers"),

      systemNote: t("fieldVisibility.systemNote"),

      cancel: t("fieldVisibility.cancel"),
      save: t("fieldVisibility.save"),
    }),
    [t],
  );
  const [draft, setDraft] = useState(() =>
    toConfigurableHiddenSet(hiddenFields),
  );
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState(() => new Set());

  const groups = useMemo(
    () => buildGroups(config, localeTexts, t),
    [config, localeTexts, t],
  );
  const configurableHiddenFields = useMemo(
    () => toConfigurableHiddenSet(hiddenFields),
    [hiddenFields],
  );

  // Sync draft + expand all groups on open
  useEffect(() => {
    if (!open) return;
    setDraft(toConfigurableHiddenSet(hiddenFields));
    setSearch("");
    setOpenGroups(new Set(groups.map((g) => g.title)));
  }, [groups, hiddenFields, open]);

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
          (f) =>
            f.label.toLowerCase().includes(q) ||
            f.key.toLowerCase().includes(q),
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
    if (draft.size !== configurableHiddenFields.size) return true;
    for (const k of draft) if (!configurableHiddenFields.has(k)) return true;
    return false;
  }, [configurableHiddenFields, draft]);

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
            <h2>{localeTexts.title}</h2>
            <span className={s.counter}>
              {visibleCount} / {totalConfigurable} {localeTexts.active}
            </span>
          </div>
          <button
            className={s.closeBtn}
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>

        {/* SEARCH */}
        <div className={s.searchWrap}>
          <span className={s.searchIcon}>⌕</span>
          <input
            className={s.searchInput}
            type="text"
            placeholder={localeTexts.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className={s.searchClear}
              type="button"
              onClick={() => setSearch("")}
            >
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
                localeTexts={localeTexts}
              />
            ))
          ) : (
            <p className={s.empty}>{localeTexts.notFound}</p>
          )}

          <p className={s.systemNote}>{localeTexts.systemNote}</p>
        </div>

        {/* FOOTER */}
        <div className={s.footer}>
          <button
            className={s.resetBtn}
            type="button"
            onClick={() => setDraft(new Set())}
            disabled={draft.size === 0}
          >
            {localeTexts.showAll}
          </button>
          <div className={s.footerRight}>
            <button className={s.cancelBtn} type="button" onClick={onClose}>
              {localeTexts.cancel}
            </button>
            <button
              className={s.saveBtn}
              type="button"
              onClick={handleSave}
              disabled={!isDirty}
            >
              {localeTexts.save}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
