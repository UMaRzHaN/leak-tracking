import StatusBadge from "@/components/ui/StatusBadge/StatusBadge";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

/**
 * @param {{
 *   src?: string|null,
 *   onEdit?: (() => void)|null,
 *   onView?: (() => void)|undefined,
 *   status?: import("@/types/domain").LeakStatus,
 *   identityNum?: string,
 *   identityTime?: string,
 *   onStatusChange?: () => void,
 * }} props
 */
export default function PhotoBlock({
  src,
  onEdit = null,
  onView,
  status = "open",
  identityNum,
  identityTime,
  onStatusChange,
}) {
  const hasPhoto = Boolean(src);
  const clickable = onEdit ?? onView;

  return (
    <div
      className={`${s.heroHeader} ${clickable ? s.heroHeaderClickable : ""}`}
      onClick={clickable ?? undefined}
      role={clickable ? "button" : undefined}
      style={
        hasPhoto
          ? { backgroundImage: `url(${src})` }
          : { background: `linear-gradient(145deg, #1a2035 0%, #0d1321 100%)` }
      }
    >
      {/* ── Camera placeholder when no photo ── */}
      {!hasPhoto && (
        <div className={s.heroPlaceholder}>
          <span className={s.heroPlaceholderIcon}>📷</span>
        </div>
      )}

      {/* ── Drag handle ── */}
      <div className={s.heroHandle} />

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
