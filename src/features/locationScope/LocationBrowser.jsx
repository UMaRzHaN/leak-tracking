import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import s from "./LocationBrowser.module.scss";

// A folder view over the location hierarchy. Browsing is local state: the
// filters only change when a folder is actually applied, so backing out of the
// sheet leaves the list on screen alone.

export default function LocationBrowser({ open, scope, onClose }) {
  const { t } = useLanguage();
  const dialogRef = useModalDialog({ open, onClose });
  const [draft, setDraft] = useState([]);

  const { levelKeys, levelLabels, path, setPath, childrenAtPath, totalCount } =
    scope;

  // Reopening starts where the current selection left off rather than at the
  // root, which is what makes stepping one level up cheap.
  useEffect(() => {
    if (open) setDraft(path ?? []);
  }, [open, path]);

  const nodes = useMemo(() => childrenAtPath(draft), [childrenAtPath, draft]);
  const unnamedLabel = t("locationScope.unnamed");
  const atDeepestLevel = draft.length >= levelKeys.length;
  const currentLevelLabel = levelLabels[draft.length] ?? "";

  const apply = (nextPath) => {
    setPath(nextPath);
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
            onClick={() => setDraft([])}
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
                onClick={() => setDraft(draft.slice(0, index + 1))}
                disabled={index === draft.length - 1}
              >
                {value || unnamedLabel}
              </button>
            </span>
          ))}
        </nav>

        {draft.length > 0 && (
          <button
            type="button"
            className={s.up}
            onClick={() => setDraft(draft.slice(0, -1))}
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
                  return (
                    <li key={node.value} className={s.row}>
                      <button
                        type="button"
                        className={s.rowMain}
                        onClick={() => apply(nextPath)}
                      >
                        <span className={s.icon} aria-hidden="true">
                          {hasChildren ? "📁" : "📍"}
                        </span>
                        <span className={s.name}>
                          {node.value || unnamedLabel}
                        </span>
                        <span className={s.count}>{node.count}</span>
                      </button>
                      {hasChildren && (
                        <button
                          type="button"
                          className={s.drill}
                          onClick={() => setDraft(nextPath)}
                          aria-label={t("locationScope.openFolder", {
                            name: node.value || unnamedLabel,
                          })}
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
            onClick={() => apply(draft)}
            disabled={draft.length === 0}
          >
            {t("locationScope.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
