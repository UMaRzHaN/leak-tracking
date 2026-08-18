import { useMemo, useState } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import { useLanguage } from "@/app/hooks/useLanguage";
import PhotoBlock from "@/features/leakDetails/components/PhotoBlock";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import {
  ACTION_ICONS,
  fmtDate,
  relativeTime,
} from "@/features/leakDetails/components/viewBlockUtils";
import { COMPONENT_HISTORY_ACTIONS } from "@/domain/componentHistory";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

/**
 * The card in full, wearing the leak details sheet: its shell, its hero photo,
 * its tab bar, its field rows, its action bar — the same stylesheet, not a
 * lookalike. A walker moving between a leak and the component it sits on should
 * meet one interface twice.
 *
 * What differs is only what a component has to say. No repair to follow and no
 * calculation to show, so two tabs rather than five, and the destructive action
 * sits behind the reading instead of in the list.
 */
export default function ComponentDetailsSheet({
  component,
  fields = [],
  onEdit,
  onRemove,
  onClose,
}) {
  const { t, lang } = useLanguage();
  const dialogRef = useModalDialog({ open: true, onClose });
  const photoSrc = usePhotoSrc(component?.photo ?? null);

  const [tab, setTab] = useState("card");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  /** Only what was answered — an empty row says nothing worth its space. */
  const filled = useMemo(
    () =>
      fields
        .filter((field) => field.viewable)
        .map((field) => ({ ...field, value: component?.[field.key] }))
        .filter(({ value }) => value != null && String(value).trim() !== ""),
    [component, fields],
  );

  const history = [...(component?.history ?? [])].reverse();

  const actionLabel = (action) =>
    ({
      [COMPONENT_HISTORY_ACTIONS.CREATED]: t("components.historyCreated"),
      [COMPONENT_HISTORY_ACTIONS.EDITED]: t("components.historyEdited"),
      [COMPONENT_HISTORY_ACTIONS.INSPECTED]: t("components.historyInspected"),
    })[action] ?? action;

  const tabs = [
    { id: "card", label: t("components.detailsTitle") },
    { id: "history", label: t("components.historyTitle") },
  ];

  return (
    <>
      {viewerOpen && photoSrc && (
        <PhotoViewer
          photos={[photoSrc]}
          labels={[component?.component ?? ""]}
          initialIndex={0}
          onClose={() => setViewerOpen(false)}
        />
      )}

      <div className={s.overlay} onClick={onClose}>
        <div
          ref={dialogRef}
          className={s.sheet}
          role="dialog"
          aria-modal="true"
          aria-label={t("components.detailsTitle")}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          <PhotoBlock
            src={photoSrc}
            status={null}
            identityNum={`№ ${component?.component_uid ?? "—"}`}
            identityTime={component?.component || t("components.unnamed")}
            onView={photoSrc ? () => setViewerOpen(true) : undefined}
            /* A component has no leak lifecycle; its state is changed by the
               inspection swipe, not from the hero. */
            onStatusChange={null}
          />

          <div className={s.tabBar}>
            {tabs.map((item) => (
              <button
                key={item.id}
                className={`${s.tab} ${tab === item.id ? s.tabActive : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className={s.tabContent} key={tab}>
            {tab === "card" ? (
              <div className={s.tabPane}>
                {filled.length === 0 ? (
                  <div className={s.tabEmpty}>
                    <p>{t("components.detailsEmpty")}</p>
                  </div>
                ) : (
                  filled.map(({ key, label, value }) => (
                    <div key={key} className={s.fieldRow}>
                      <span className={s.fieldLabel}>{label}</span>
                      <span className={s.fieldValue}>{String(value)}</span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className={s.tabPane}>
                {history.length === 0 ? (
                  <div className={s.tabEmpty}>
                    <p>{t("components.historyEmpty")}</p>
                  </div>
                ) : (
                  history.map((entry, index) => (
                    <div key={`${entry.date}-${index}`} className={s.logEntry}>
                      <div className={s.logDotWrap}>
                        <span className={s.logDot}>
                          {ACTION_ICONS[entry.action] ?? "•"}
                        </span>
                        {index < history.length - 1 && (
                          <span className={s.logLine} />
                        )}
                      </div>
                      <div className={s.logBody}>
                        <span className={s.logAction}>
                          {actionLabel(entry.action)}
                        </span>
                        {entry.user && (
                          <span className={s.logUser}>{entry.user}</span>
                        )}
                        {entry.to && (
                          <span className={s.logStatus}>{entry.to}</span>
                        )}
                        {Array.isArray(entry.changes) &&
                          entry.changes.map((change) => (
                            <span key={change.key} className={s.logChange}>
                              {change.key}
                            </span>
                          ))}
                        <span className={s.logTime}>
                          {fmtDate(entry.date, lang)} ·{" "}
                          {relativeTime(entry.date, t)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className={s.actionBar}>
            {confirmingRemove ? (
              <>
                <button
                  className={s.btnGhost}
                  onClick={() => setConfirmingRemove(false)}
                >
                  {t("components.cancel")}
                </button>
                <button
                  className={s.btnDangerArmed}
                  onClick={() => onRemove?.(component)}
                >
                  {t("components.removeConfirm")}
                </button>
              </>
            ) : (
              <>
                {/* Behind the reading rather than in the list, where a mis-tap
                    costs a card somebody walked out to write. */}
                <button
                  className={s.btnDanger}
                  onClick={() => setConfirmingRemove(true)}
                >
                  {t("components.removeShort")}
                </button>
                <button
                  className={s.btnPrimary}
                  onClick={() => onEdit?.(component)}
                >
                  {t("components.edit")}
                </button>
                <button className={s.btnGhost} onClick={onClose}>
                  {t("components.close")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
