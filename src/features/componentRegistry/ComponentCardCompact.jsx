import { memo, useRef, useState } from "react";
import { useSwipeActions } from "@/hooks/useSwipeActions";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import { useLanguage } from "@/app/hooks/useLanguage";
import { formatLeakDate } from "@/utils/locale";
import { timeAgo } from "@/utils/timeAgo";
import s from "./ComponentCardCompact.module.scss";

/**
 * One component in the registry list, built to the same idea as the compact
 * leak card: a photograph you can recognise the hardware by, the identity, and
 * the two swipes that carry the actions.
 *
 * Swipe directions match the leak card exactly: right-to-left reaches the state
 * of the thing, left-to-right opens it in full. One gesture vocabulary across
 * both lists — a hand that learned it on leaks does not have to unlearn it here.
 */
function ComponentCardCompact({
  component,
  conflicting = false,
  selected = false,
  // Расстояние от того места, где человек стоит, до этого железа. Считается
  // списком, а не карточкой: одна и та же точка отсчёта на все карточки.
  distance = null,
  onToggleSelect = null,
  onOpenDetails,
  onInspect,
}) {
  const { t, lang } = useLanguage();
  const [offset, setOffset] = useState(0);
  /*
   * A finished swipe resets the offset before the browser delivers the click
   * that ends it, so a gesture used to fire its own action and then open the
   * card on top. The flag outlives that reset by one event.
   */
  const swipedRef = useRef(false);
  const photoSrc = usePhotoSrc(component.photo ?? null);

  const swipe = useSwipeActions({
    onSwipeMove: (dx) => {
      if (Math.abs(dx) > 4) swipedRef.current = true;
      setOffset(dx);
    },
    // 👈 right to left — state of the hardware, and the visit that found it
    onSwipeLeft: () => onInspect?.(component),
    // 👉 left to right — the card in full
    onSwipeRight: () => onOpenDetails?.(component),
  });

  const openIfNotSwiping = () => {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    onOpenDetails?.(component);
  };
  const status = String(component.component_status ?? "").trim();
  /*
   * Когда железо видели в последний раз — тем же, чем это подписано у утечки:
   * «2 часа назад» рядом, датой, когда «рядом» уже ничего не значит.
   *
   * Осмотр важнее заведения: карточку заводят однажды, а обходят её потом
   * годами, и в списке спрашивают «когда здесь были», а не «когда завели».
   * Дата инспекции ставится и при заведении — тогда это одно и то же число, и
   * показать любое из них значит показать верное.
   */
  const seenAt = component.inspected_at || component.date;
  const recorded = timeAgo(seenAt, lang) ?? formatLeakDate(seenAt, {}, lang);

  return (
    <li className={s.row}>
      {/* The hints sit under the card and are uncovered by the swipe itself,
          so the gesture explains what it is about to do while it happens. */}
      <span className={`${s.hint} ${s.hintLeft}`} aria-hidden="true">
        {t("components.swipeDetails")}
      </span>
      <span className={`${s.hint} ${s.hintRight}`} aria-hidden="true">
        {t("components.swipeInspect")}
      </span>

      <div
        className={`${s.card} ${selected ? s.cardSelected : ""}`}
        data-selected={selected ? "true" : undefined}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
        onMouseDown={swipe.onMouseDown}
        onMouseMove={swipe.onMouseMove}
        onMouseUp={swipe.onMouseUp}
      >
        {/* Отметка появляется, только когда список набирают: иначе она стоит
            рядом с каждой карточкой и предлагает действие, которого никто не
            начинал. */}
        {onToggleSelect && (
          <button
            type="button"
            className={`${s.selectToggle} ${
              selected ? s.selectToggleActive : ""
            }`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect(component.id);
            }}
            aria-pressed={selected}
            aria-label={
              selected ? t("components.deselect") : t("components.select")
            }
          >
            {selected ? "✓" : ""}
          </button>
        )}

        <button type="button" className={s.body} onClick={openIfNotSwiping}>
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
              {recorded && <span className={s.time}>{recorded}</span>}
            </span>
            <span className={s.meta}>
              {[component.location, component.object, component.scheme_tag]
                .filter(Boolean)
                .join(" · ") || t("components.noLocation")}
            </span>
            <span className={s.footRow}>
              {distance != null && (
                <span className={s.chipNear}>
                  📌 {distance} {t("common.units.meters")}
                </span>
              )}
              {status && <span className={s.status}>{status}</span>}
            </span>
          </span>
        </button>
      </div>
    </li>
  );
}

export default memo(ComponentCardCompact);
