import { shortenPlaceName } from "@/utils/abbreviations";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import s from "./LocationBrowser.module.scss";

// A folder view over the location hierarchy. Browsing is local state: the
// filters only change when a folder is actually applied, so backing out of the
// sheet leaves the list on screen alone.
//
// Ticking folders picks several siblings at once; once anything is ticked, a
// tap on a row toggles it too, and the footer applies the whole set.

export default function LocationBrowser({ open, scope, onClose, onApplied }) {
  const { t } = useLanguage();
  const dialogRef = useModalDialog({ open, onClose });
  const [draft, setDraft] = useState(/** @type {any[]} */ ([]));
  const [picked, setPicked] = useState(/** @type {string[]} */ ([]));

  const {
    levelKeys,
    levelLabels,
    path,
    setPath,
    selection,
    setSelection,
    childrenAtPath,
    totalCount,
  } = scope;

  // Reopening starts where the current selection left off rather than at the
  // root, which is what makes stepping one level up cheap. Several picked
  // folders reopen on their parent with the ticks in place.
  useEffect(() => {
    if (!open) return;
    if (path) {
      setDraft(path);
      setPicked([]);
    } else if (selection) {
      setDraft(selection.path);
      setPicked(selection.values);
    } else {
      setDraft([]);
      setPicked([]);
    }
  }, [open, path, selection]);

  // Ticks belong to one level; carrying them into another folder would pick
  // siblings of a parent the user has left.
  const openLevel = (nextDraft) => {
    setDraft(nextDraft);
    setPicked([]);
  };

  const togglePicked = (value) =>
    setPicked((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );

  const nodes = useMemo(() => childrenAtPath(draft), [childrenAtPath, draft]);
  const unnamedLabel = t("locationScope.unnamed");
  const atDeepestLevel = draft.length >= levelKeys.length;
  const currentLevelLabel = levelLabels[draft.length] ?? "";

  const apply = (nextPath) => {
    setPath(nextPath);
    // Opening a folder shows what is inside it, the way a file manager does.
    // Landing back on whatever screen the browser was opened from would leave
    // the user to go looking for the records they just selected.
    onApplied?.(nextPath);
    onClose?.();
  };

  const applyPicked = () => {
    if (picked.length === 1) {
      apply([...draft, picked[0]]);
      return;
    }
    setSelection(draft, picked);
    onApplied?.(draft, picked);
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className={s.overlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={t("locationScope.title")}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={s.handle} />

        <div className={s.header}>
          <h2 className={s.title}>{t("locationScope.title")}</h2>
          <button
            type="button"
            className={s.close}
            onClick={onClose}
            aria-label={t("locationScope.close")}
          >
            ✕
          </button>
        </div>

        <nav className={s.crumbs} aria-label={t("locationScope.pathLabel")}>
          <button
            type="button"
            className={s.crumb}
            onClick={() => openLevel([])}
            disabled={draft.length === 0}
          >
            {t("locationScope.all")}
          </button>
          {draft.map((value, index) => (
            <span key={`${index}-${value}`} className={s.crumbWrap}>
              <span className={s.crumbSep} aria-hidden="true">
                ›
              </span>
              <button
                type="button"
                className={s.crumb}
                onClick={() => openLevel(draft.slice(0, index + 1))}
                disabled={index === draft.length - 1}
              >
                {shortenPlaceName(value) || unnamedLabel}
              </button>
            </span>
          ))}
        </nav>

        {draft.length > 0 && (
          <button
            type="button"
            className={s.up}
            onClick={() => openLevel(draft.slice(0, -1))}
          >
            ← {t("locationScope.up")}
          </button>
        )}

        <div className={s.body}>
          {atDeepestLevel ? (
            <p className={s.note}>{t("locationScope.deepest")}</p>
          ) : nodes.length === 0 ? (
            <p className={s.note}>{t("locationScope.empty")}</p>
          ) : (
            <>
              <p className={s.levelLabel}>{currentLevelLabel}</p>
              <ul className={s.list}>
                {nodes.map((node) => {
                  const nextPath = [...draft, node.value];
                  const hasChildren = node.children.length > 0;
                  const isPicked = picked.includes(node.value);
                  const name = node.value || unnamedLabel;
                  return (
                    <li key={node.value} className={s.row}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isPicked}
                        className={`${s.check} ${isPicked ? s.checkOn : ""}`}
                        onClick={() => togglePicked(node.value)}
                        aria-label={t("locationScope.pick", { name })}
                      >
                        <span className={s.checkBox} aria-hidden="true">
                          {isPicked ? "✓" : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`${s.rowMain} ${isPicked ? s.rowPicked : ""}`}
                        onClick={() =>
                          picked.length > 0
                            ? togglePicked(node.value)
                            : apply(nextPath)
                        }
                      >
                        <span className={s.icon} aria-hidden="true">
                          {hasChildren ? "📁" : "📍"}
                        </span>
                        {/* На виду — с сокращениями из словаря, в
                            подписи для диктора — полное название. */}
                        <span className={s.name}>
                          {shortenPlaceName(node.value) || unnamedLabel}
                        </span>
                        <span className={s.count}>{node.count}</span>
                      </button>
                      {hasChildren && (
                        <button
                          type="button"
                          className={s.drill}
                          onClick={() => openLevel(nextPath)}
                          aria-label={t("locationScope.openFolder", { name })}
                        >
                          ›
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className={s.footer}>
          <button
            type="button"
            className={s.secondary}
            onClick={() => apply([])}
          >
            {t("locationScope.showAll", { count: totalCount })}
          </button>
          <button
            type="button"
            className={s.primary}
            onClick={() => (picked.length > 0 ? applyPicked() : apply(draft))}
            disabled={draft.length === 0 && picked.length === 0}
          >
            {picked.length > 0
              ? t("locationScope.applyPicked", { count: picked.length })
              : t("locationScope.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
