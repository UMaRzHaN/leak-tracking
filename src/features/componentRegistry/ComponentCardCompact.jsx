import { memo, useState } from "react";
import { useSwipeActions } from "@/hooks/useSwipeActions";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./ComponentCardCompact.module.scss";

/**
 * One component in the registry list, built to the same idea as the compact
 * leak card: a photograph you can recognise the hardware by, the identity, and
 * the two swipes that carry the actions.
 *
 * The swipe directions are the reverse of the leak card's, and deliberately so.
 * There, right-to-left reaches the status because a leak's status is what
 * changes constantly. Here it reaches the detail, because a walker with a
 * finished registry is mostly reading it; changing what the hardware is doing
 * is the rarer act and sits on the other side.
 */
function ComponentCardCompact({
  component,
  conflicting = false,
  onOpenDetails,
  onInspect,
  onRemove,
}) {
  const { t } = useLanguage();
  const [offset, setOffset] = useState(0);
  const photoSrc = usePhotoSrc(component.photo ?? null);

  const swipe = useSwipeActions({
    onSwipeMove: setOffset,
    // 👈 right to left — the card in full
    onSwipeLeft: () => {
      setOffset(0);
      onOpenDetails?.(component);
    },
    // 👉 left to right — state of the hardware, and the visit that found it
    onSwipeRight: () => {
      setOffset(0);
      onInspect?.(component);
    },
  });

  const swiping = Math.abs(offset) > 4;
  const status = String(component.component_status ?? "").trim();

  return (
    <li className={s.row}>
      {/* The hints sit under the card and are uncovered by the swipe itself,
          so the gesture explains what it is about to do while it happens. */}
      <span className={`${s.hint} ${s.hintLeft}`} aria-hidden="true">
        {t("components.swipeInspect")}
      </span>
      <span className={`${s.hint} ${s.hintRight}`} aria-hidden="true">
        {t("components.swipeDetails")}
      </span>

      <div
        className={s.card}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
        onMouseDown={swipe.onMouseDown}
        onMouseMove={swipe.onMouseMove}
        onMouseUp={swipe.onMouseUp}
      >
        <button
          type="button"
          className={s.body}
          onClick={() => {
            if (!swiping) onOpenDetails?.(component);
          }}
        >
          <span className={s.thumb}>
            {photoSrc ? (
              <img src={photoSrc} alt="" loading="lazy" />
            ) : (
              /* An empty frame rather than a hidden one: the gap is the point,
                 it says this card has no evidence behind it yet. */
              <span className={s.thumbEmpty} aria-hidden="true">
                ⬚
              </span>
            )}
          </span>

          <span className={s.text}>
            <span className={s.head}>
              <span
                className={conflicting ? s.uidConflict : s.uid}
                data-conflict={conflicting || undefined}
              >
                {component.component_uid || "—"}
              </span>
              <span className={s.name}>
                {component.component || t("components.unnamed")}
              </span>
            </span>
            <span className={s.meta}>
              {[component.location, component.object, component.scheme_tag]
                .filter(Boolean)
                .join(" · ") || t("components.noLocation")}
            </span>
            {status && <span className={s.status}>{status}</span>}
          </span>
        </button>

        <button
          type="button"
          className={s.remove}
          onClick={() => onRemove?.(component)}
          aria-label={t("components.remove")}
        >
          ×
        </button>
      </div>
    </li>
  );
}

export default memo(ComponentCardCompact);
