import { useRef, useState } from "react";
import StatusBadge from "@/components/ui/StatusBadge/StatusBadge";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import Icon from "@/components/ui/Icon/Icon";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

/**
 * Один снимок ленты: путь разрешается в адрес здесь же, у каждого свой.
 */
function HeroSlide({ path, onSrc }) {
  const src = usePhotoSrc(path);
  onSrc(path, src);
  return (
    <div
      className={s.heroSlide}
      style={src ? { backgroundImage: `url(${src})` } : undefined}
    />
  );
}

/**
 * @param {{
 *   src?: string|null,
 *   photoPaths?: string[],
 *   counterLabel?: (index: number, total: number) => string,
 *   onEdit?: (() => void)|null,
 *   onView?: ((src?: string|null) => void)|undefined,
 *   status?: import("@/types/domain").LeakStatus|null,
 *   identityNum?: string,
 *   identityTime?: string,
 *   onStatusChange?: (() => void)|null,
 *   onBack?: (() => void)|null,
 *   backLabel?: string,
 * }} props
 */
export default function PhotoBlock({
  src,
  // Несколько снимков листаются свайпом (5e); без них — один `src`.
  photoPaths = /** @type {string[]} */ ([]),
  counterLabel = (index, total) => `${index} / ${total}`,
  onEdit = null,
  onView,
  status = "open",
  identityNum,
  identityTime,
  onStatusChange,
  onBack = null,
  backLabel = "",
}) {
  const [index, setIndex] = useState(0);
  // Адреса снимков ленты — чтобы тап открыл тот, что сейчас на экране.
  const slideSrcs = useRef(
    /** @type {Map<string, string|null>} */ (new Map()),
  ).current;
  const slides = photoPaths.length > 0;
  const hasPhoto = slides || Boolean(src);
  const current = Math.min(index, Math.max(photoPaths.length - 1, 0));
  const clickable = onEdit ?? (onView ? () => onView(currentSrc()) : null);

  function currentSrc() {
    return slides ? (slideSrcs.get(photoPaths[current]) ?? src) : src;
  }

  return (
    <div
      className={`${s.heroHeader} ${clickable ? s.heroHeaderClickable : ""}`}
      onClick={clickable ?? undefined}
      role={clickable ? "button" : undefined}
      style={
        slides
          ? undefined
          : hasPhoto
            ? { backgroundImage: `url(${src})` }
            : {
                background: `linear-gradient(145deg, #1a2035 0%, #0d1321 100%)`,
              }
      }
    >
      {/* ── Лента снимков: листается пальцем, прилипает к кадру ── */}
      {slides && (
        <div
          className={s.heroTrack}
          onScroll={(event) => {
            const track = event.currentTarget;
            if (!track.clientWidth) return;
            setIndex(Math.round(track.scrollLeft / track.clientWidth));
          }}
        >
          {photoPaths.map((path) => (
            <HeroSlide
              key={path}
              path={path}
              onSrc={(key, value) => slideSrcs.set(key, value)}
            />
          ))}
        </div>
      )}

      {/* ── Camera placeholder when no photo ── */}
      {!hasPhoto && (
        <div className={s.heroPlaceholder}>
          <span className={s.heroPlaceholderIcon}>📷</span>
        </div>
      )}

      {/* ── Назад: карточка теперь экран, а не шторка, и тянуть её некуда ── */}
      {onBack && (
        <button
          type="button"
          className={s.heroBack}
          aria-label={backLabel}
          onClick={(event) => {
            event.stopPropagation();
            onBack();
          }}
        >
          <Icon name="chevronLeft" size={22} strokeWidth={2} />
        </button>
      )}

      {/* ── Dark gradient overlay for text readability ── */}
      <div className={s.heroOverlay} />

      {/* ── Status badge — top right ── */}
      <div className={s.heroBadgeRow}>
        {/* A component has no leak lifecycle, so it passes no status and the
            badge is simply absent rather than claiming the card is "open". */}
        {status && (
          <StatusBadge status={status} size="md" onClick={onStatusChange} />
        )}
      </div>

      {/* ── Номер снимка — снизу справа, только когда их несколько ── */}
      {photoPaths.length > 1 && (
        <span className={s.heroCounter} aria-live="polite">
          {counterLabel(current + 1, photoPaths.length)}
        </span>
      )}

      {/* ── Identity info — bottom left ── */}
      <div className={s.heroIdentity}>
        <span className={s.heroNum}>{identityNum}</span>
        {identityTime && <span className={s.heroTime}>{identityTime}</span>}
      </div>

      {/* ── Tap-to-view/edit overlay icon ── */}
      {onEdit && (
        <div className={s.heroActionHint}>
          <span>✏</span>
        </div>
      )}
      {onView && hasPhoto && !onEdit && (
        <div className={s.heroActionHint}>
          <span>🔍</span>
        </div>
      )}
    </div>
  );
}
